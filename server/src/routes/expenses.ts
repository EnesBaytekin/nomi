import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard } from '../auth.js';
import { db, type ExpenseRow, type UserRow } from '../db.js';
import { openExpense, sealExpense } from '../data-crypto.js';
import { HttpError } from '../errors.js';
import { parse } from '../util.js';

const MAX_AMOUNT = 1_000_000_000_000; // 10 milyar TL (kuruş) — makul üst sınır

const amountField = z
  .number()
  .int('kuruş cinsinden tam sayı olmalı')
  .positive('sıfırdan büyük olmalı')
  .max(MAX_AMOUNT);
const noteField = z.string().trim().max(280).nullish().transform((v) => v || null);
const spentAtField = z
  .union([z.number(), z.string().datetime({ offset: true })])
  .transform((v) => (typeof v === 'number' ? v : Date.parse(v)))
  .refine((v) => Number.isFinite(v) && v > 0, 'geçerli bir tarih olmalı');

export interface ExpenseDto {
  id: string;
  typeId: string;
  typeName: string;
  typeIcon: string;
  typeIdArchived?: boolean;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  amount: number;
  note: string | null;
  spentAt: number;
  createdAt: number;
}

export async function expenseRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  // Ana ekran için tek çağrılı özet
  app.get('/home', async (req) => {
    const types = db
      .prepare(
        `SELECT t.id, t.name, t.icon, t.archived, t.sort_order, c.id AS category_id, c.name AS category_name, c.color AS category_color
         FROM expense_types t JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = ? ORDER BY t.sort_order, t.created_at`,
      )
      .all(req.user.id) as Array<{
      id: string;
      name: string;
      icon: string;
      archived: number;
      sort_order: number;
      category_id: string;
      category_name: string;
      category_color: string;
    }>;

    const activeTypes = types.filter((t) => t.archived === 0);

    const dayStart = startOfToday();
    const monthStart = startOfMonth();

    const todayRows = selectRows(req.user, dayStart, Date.now(), 20, 0);
    const todayTotal = todayRows.reduce((s, r) => s + r.payload.a, 0);

    const monthRows = selectRows(req.user, monthStart, Date.now(), 100_000, 0);
    const monthTotal = monthRows.reduce((s, r) => s + r.payload.a, 0);

    const recent = db
      .prepare(
        `SELECT type_id, COUNT(*) AS c FROM expenses
         WHERE user_id = ? AND spent_at > ? GROUP BY type_id ORDER BY c DESC LIMIT 5`,
      )
      .all(req.user.id, Date.now() - 30 * 24 * 60 * 60 * 1000) as Array<{ type_id: string; c: number }>;

    return {
      todayTotal,
      monthTotal,
      today: todayRows.map((r) => r.dto),
      types: activeTypes.map((t) => ({
        id: t.id,
        name: t.name,
        icon: t.icon,
        categoryId: t.category_id,
        categoryName: t.category_name,
        categoryColor: t.category_color,
      })),
      recentTypeIds: recent.map((r) => r.type_id),
    };
  });

  app.post('/expenses', async (req, reply) => {
    const body = parse(
      z.object({
        typeId: z.string().uuid(),
        amount: amountField,
        note: noteField,
        spentAt: spentAtField.optional(),
      }),
      req.body,
    );
    const type = db
      .prepare(`SELECT id, archived FROM expense_types WHERE id = ? AND user_id = ?`)
      .get(body.typeId, req.user.id) as { id: string; archived: number } | undefined;
    if (!type) throw new HttpError(404, 'Harcama türü bulunamadı');
    if (type.archived === 1) throw new HttpError(400, 'Arşivlenmiş tür seçilemez');

    const id = crypto.randomUUID();
    const spentAt = body.spentAt ?? Date.now();
    db.prepare(
      `INSERT INTO expenses (id, user_id, type_id, spent_at, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, req.user.id, body.typeId, spentAt, sealExpense(req.user, body.amount, body.note), spentAt, spentAt);
    reply.code(201);
    return { id };
  });

  app.get('/expenses', async (req) => {
    const q = parse(
      z.object({
        from: z.coerce.number().int().optional(),
        to: z.coerce.number().int().optional(),
        typeId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      req.query,
    );
    const rows = selectRows(req.user, q.from, q.to, q.limit, q.offset, q.typeId);
    const conditions = ['user_id = ?'];
    const params: unknown[] = [req.user.id];
    if (q.from !== undefined) { conditions.push('spent_at >= ?'); params.push(q.from); }
    if (q.to !== undefined) { conditions.push('spent_at <= ?'); params.push(q.to); }
    if (q.typeId) { conditions.push('type_id = ?'); params.push(q.typeId); }
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM expenses WHERE ${conditions.join(' AND ')}`).get(...params) as { c: number }
    ).c;
    return { rows: rows.map((r) => r.dto), total };
  });

  app.patch('/expenses/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(
      z.object({
        typeId: z.string().uuid().optional(),
        amount: amountField.optional(),
        note: noteField,
        spentAt: spentAtField.optional(),
      }),
      req.body,
    );
    const row = db
      .prepare(`SELECT * FROM expenses WHERE id = ? AND user_id = ?`)
      .get(id, req.user.id) as ExpenseRow | undefined;
    if (!row) throw new HttpError(404, 'Harcama bulunamadı');

    if (body.typeId && body.typeId !== row.type_id) {
      const type = db
        .prepare(`SELECT id, archived FROM expense_types WHERE id = ? AND user_id = ?`)
        .get(body.typeId, req.user.id) as { id: string; archived: number } | undefined;
      if (!type) throw new HttpError(404, 'Harcama türü bulunamadı');
      if (type.archived === 1) throw new HttpError(400, 'Arşivlenmiş tür seçilemez');
    }

    const current = openExpense(req.user, row.data);
    const amount = body.amount ?? current.a;
    const note = body.note !== undefined ? body.note : current.n;
    const spentAt = body.spentAt ?? row.spent_at;
    const typeId = body.typeId ?? row.type_id;
    db.prepare(
      `UPDATE expenses SET type_id = ?, spent_at = ?, data = ?, updated_at = ? WHERE id = ?`,
    ).run(typeId, spentAt, sealExpense(req.user, amount, note), Date.now(), id);
    return { ok: true };
  });

  app.delete('/expenses/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const info = db.prepare(`DELETE FROM expenses WHERE id = ? AND user_id = ?`).run(id, req.user.id);
    if (info.changes === 0) throw new HttpError(404, 'Harcama bulunamadı');
    return { ok: true };
  });
}

// --- Yardımcılar ---

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonth(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface JoinedRow {
  id: string;
  type_id: string;
  spent_at: number;
  data: string;
  created_at: number;
  type_name: string;
  type_icon: string;
  type_archived: number;
  category_id: string;
  category_name: string;
  category_color: string;
}

export function selectRows(
  user: UserRow,
  from: number | undefined,
  to: number | undefined,
  limit: number,
  offset: number,
  typeId?: string,
): Array<{ dto: ExpenseDto; payload: { a: number; n: string | null } }> {
  const conditions = ['e.user_id = ?'];
  const params: unknown[] = [user.id];
  if (from !== undefined) { conditions.push('e.spent_at >= ?'); params.push(from); }
  if (to !== undefined) { conditions.push('e.spent_at <= ?'); params.push(to); }
  if (typeId) { conditions.push('e.type_id = ?'); params.push(typeId); }

  const rows = db
    .prepare(
      `SELECT e.id, e.type_id, e.spent_at, e.data, e.created_at,
              t.name AS type_name, t.icon AS type_icon, t.archived AS type_archived,
              c.id AS category_id, c.name AS category_name, c.color AS category_color
       FROM expenses e
       JOIN expense_types t ON t.id = e.type_id
       JOIN categories c ON c.id = t.category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.spent_at DESC, e.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as JoinedRow[];

  return rows.map((row) => {
    const payload = openExpense(user, row.data);
    return {
      payload,
      dto: {
        id: row.id,
        typeId: row.type_id,
        typeName: row.type_name,
        typeIcon: row.type_icon,
        typeIdArchived: row.type_archived === 1,
        categoryId: row.category_id,
        categoryName: row.category_name,
        categoryColor: row.category_color,
        amount: payload.a,
        note: payload.n,
        spentAt: row.spent_at,
        createdAt: row.created_at,
      },
    };
  });
}
