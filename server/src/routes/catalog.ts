import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard } from '../auth.js';
import { db, type CategoryRow, type TypeRow } from '../db.js';
import { HttpError } from '../errors.js';
import { parse } from '../util.js';

const nameField = z.string().trim().min(1, 'boş olamaz').max(40);
const iconField = z.string().trim().min(1).max(8).default('🏷️');
const colorField = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, '#rrggbb biçiminde olmalı')
  .default('#34d399');

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  // Kategoriler ve altındaki türler (arşivliler dahil; istemci filtreler)
  app.get('/catalog', async (req) => {
    const cats = db
      .prepare(`SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order, created_at`)
      .all(req.user.id) as CategoryRow[];
    const types = db
      .prepare(`SELECT * FROM expense_types WHERE user_id = ? ORDER BY sort_order, created_at`)
      .all(req.user.id) as TypeRow[];
    return {
      categories: cats.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        sortOrder: c.sort_order,
        types: types
          .filter((t) => t.category_id === c.id)
          .map((t) => ({
            id: t.id,
            name: t.name,
            icon: t.icon,
            archived: t.archived === 1,
            sortOrder: t.sort_order,
          })),
      })),
    };
  });

  // --- Kategoriler ---

  app.post('/categories', async (req) => {
    const body = parse(z.object({ name: nameField, icon: iconField, color: colorField }), req.body);
    const max = db
      .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories WHERE user_id = ?`)
      .get(req.user.id) as { m: number };
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO categories (id, user_id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, req.user.id, body.name, body.icon, body.color, max.m + 10, Date.now());
    return { id };
  });

  app.patch('/categories/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(
      z.object({ name: nameField.optional(), icon: iconField.optional(), color: colorField.optional() }),
      req.body,
    );
    const row = db
      .prepare(`SELECT * FROM categories WHERE id = ? AND user_id = ?`)
      .get(id, req.user.id) as CategoryRow | undefined;
    if (!row) throw new HttpError(404, 'Kategori bulunamadı');
    db.prepare(`UPDATE categories SET name = ?, icon = ?, color = ? WHERE id = ?`).run(
      body.name ?? row.name,
      body.icon ?? row.icon,
      body.color ?? row.color,
      id,
    );
    return { ok: true };
  });

  app.delete('/categories/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const row = db
      .prepare(`SELECT id FROM categories WHERE id = ? AND user_id = ?`)
      .get(id, req.user.id);
    if (!row) throw new HttpError(404, 'Kategori bulunamadı');
    const typeCount = db
      .prepare(`SELECT COUNT(*) AS c FROM expense_types WHERE category_id = ?`)
      .get(id) as { c: number };
    if (typeCount.c > 0) {
      throw new HttpError(409, 'Kategori boş değil. Önce türleri başka kategoriye taşıyın veya silin.');
    }
    db.prepare(`DELETE FROM categories WHERE id = ?`).run(id);
    return { ok: true };
  });

  // --- Türler ---

  app.post('/types', async (req) => {
    const body = parse(
      z.object({ categoryId: z.string().uuid(), name: nameField, icon: iconField }),
      req.body,
    );
    const cat = db
      .prepare(`SELECT id FROM categories WHERE id = ? AND user_id = ?`)
      .get(body.categoryId, req.user.id);
    if (!cat) throw new HttpError(404, 'Kategori bulunamadı');
    const max = db
      .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM expense_types WHERE user_id = ?`)
      .get(req.user.id) as { m: number };
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO expense_types (id, user_id, category_id, name, icon, archived, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    ).run(id, req.user.id, body.categoryId, body.name, body.icon, max.m + 10, Date.now());
    return { id };
  });

  app.patch('/types/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(
      z.object({
        name: nameField.optional(),
        icon: iconField.optional(),
        categoryId: z.string().uuid().optional(),
        archived: z.boolean().optional(),
      }),
      req.body,
    );
    const row = db
      .prepare(`SELECT * FROM expense_types WHERE id = ? AND user_id = ?`)
      .get(id, req.user.id) as TypeRow | undefined;
    if (!row) throw new HttpError(404, 'Tür bulunamadı');
    if (body.categoryId && body.categoryId !== row.category_id) {
      const cat = db
        .prepare(`SELECT id FROM categories WHERE id = ? AND user_id = ?`)
        .get(body.categoryId, req.user.id);
      if (!cat) throw new HttpError(404, 'Hedef kategori bulunamadı');
    }
    db.prepare(
      `UPDATE expense_types SET name = ?, icon = ?, category_id = ?, archived = ? WHERE id = ?`,
    ).run(
      body.name ?? row.name,
      body.icon ?? row.icon,
      body.categoryId ?? row.category_id,
      body.archived === undefined ? row.archived : body.archived ? 1 : 0,
      id,
    );
    return { ok: true };
  });

  app.delete('/types/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const row = db
      .prepare(`SELECT id FROM expense_types WHERE id = ? AND user_id = ?`)
      .get(id, req.user.id);
    if (!row) throw new HttpError(404, 'Tür bulunamadı');
    const used = db.prepare(`SELECT COUNT(*) AS c FROM expenses WHERE type_id = ?`).get(id) as { c: number };
    if (used.c > 0) {
      throw new HttpError(409, 'Bu türde harcamalar var. Silmek yerine arşivleyebilirsin.', 'IN_USE');
    }
    db.prepare(`DELETE FROM expense_types WHERE id = ?`).run(id);
    return { ok: true };
  });

  // Sıralama değişimi: iki kaydın sort_order değerlerini yer değiştirir
  app.post('/catalog/swap', async (req) => {
    const body = parse(
      z.object({
        kind: z.enum(['category', 'type']),
        a: z.string().uuid(),
        b: z.string().uuid(),
      }),
      req.body,
    );
    const table = body.kind === 'category' ? 'categories' : 'expense_types';
    const get = db.prepare(`SELECT id, sort_order FROM ${table} WHERE id = ? AND user_id = ?`);
    const rowA = get.get(body.a, req.user.id) as { id: string; sort_order: number } | undefined;
    const rowB = get.get(body.b, req.user.id) as { id: string; sort_order: number } | undefined;
    if (!rowA || !rowB) throw new HttpError(404, 'Kayıt bulunamadı');
    const tx = db.transaction(() => {
      db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`).run(rowB.sort_order, rowA.id);
      db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`).run(rowA.sort_order, rowB.id);
    });
    tx();
    return { ok: true };
  });
}
