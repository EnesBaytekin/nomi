import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard } from '../auth.js';
import { db } from '../db.js';
import { parse } from '../util.js';
import { selectRows } from './expenses.js';

/**
 * İstatistikler istemcinin saat dilimine göre gruplanır.
 * İstemci `tz` olarak Date.prototype.getTimezoneOffset() değerini gönderir
 * (ör. Türkiye UTC+3 için -180). Duvar saati = ts - tz dakika.
 */
function wallDate(ts: number, tzMin: number): Date {
  return new Date(ts - tzMin * 60000);
}

function ymOf(ts: number, tzMin: number): string {
  const d = wallDate(ts, tzMin);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthStartTs(ym: string, tzMin: number): number {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return Date.UTC(y, m - 1, 1) + tzMin * 60000;
}

function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

interface MonthBucket {
  ym: string;
  total: number;
  count: number;
  byCategory: Record<string, number>;
  byType: Record<string, number>;
}

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  // Son N ayın (o ay dahil) toplamları: kategori ve tür bazında
  app.get('/stats/monthly', async (req) => {
    const q = parse(
      z.object({
        months: z.coerce.number().int().min(1).max(24).default(6),
        tz: z.coerce.number().int().min(-840).max(840).default(-180),
      }),
      req.query,
    );
    const nowYm = ymOf(Date.now(), q.tz);
    const firstYm = shiftYm(nowYm, -(q.months - 1));
    const fromTs = monthStartTs(firstYm, q.tz);
    const toTs = monthStartTs(shiftYm(nowYm, 1), q.tz) - 1;

    const rows = selectRows(req.user, fromTs, toTs, 100_000, 0);

    const buckets = new Map<string, MonthBucket>();
    for (let i = 0; i < q.months; i++) {
      const ym = shiftYm(firstYm, i);
      buckets.set(ym, { ym, total: 0, count: 0, byCategory: {}, byType: {} });
    }
    for (const { dto } of rows) {
      const ym = ymOf(dto.spentAt, q.tz);
      const b = buckets.get(ym);
      if (!b) continue;
      b.total += dto.amount;
      b.count += 1;
      b.byCategory[dto.categoryId] = (b.byCategory[dto.categoryId] ?? 0) + dto.amount;
      b.byType[dto.typeId] = (b.byType[dto.typeId] ?? 0) + dto.amount;
    }
    return { months: [...buckets.values()] }; // eskiden yeniye
  });

  // Tüm verinin dışa aktarımı (JSON yedek / CSV Excel uyumlu)
  app.get('/export', async (req) => {
    const q = parse(z.object({ format: z.enum(['json', 'csv']).default('json') }), req.query);

    const cats = db
      .prepare(`SELECT id, name, icon, color, sort_order FROM categories WHERE user_id = ? ORDER BY sort_order`)
      .all(req.user.id);
    const types = db
      .prepare(`SELECT id, category_id, name, icon, archived, sort_order FROM expense_types WHERE user_id = ? ORDER BY sort_order`)
      .all(req.user.id);
    const rows = selectRows(req.user, undefined, undefined, 1_000_000, 0);

    if (q.format === 'csv') {
      const header = ['Tarih', 'Saat', 'Tür', 'Kategori', 'Miktar (TL)', 'Not'];
      const esc = (v: string | number) => {
        const s = String(v).replace(/"/g, '""');
        return /[";\n]/.test(s) ? `"${s}"` : s;
      };
      const lines = [header.join(';')];
      for (const { dto } of rows) {
        const d = new Date(dto.spentAt);
        const pad = (n: number) => String(n).padStart(2, '0');
        lines.push(
          [
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
            `${pad(d.getHours())}:${pad(d.getMinutes())}`,
            esc(dto.typeName),
            esc(dto.categoryName),
            (dto.amount / 100).toFixed(2).replace('.', ','),
            esc(dto.note ?? ''),
          ].join(';'),
        );
      }
      return lines.join('\r\n');
    }

    return {
      exportedAt: new Date().toISOString(),
      user: { username: req.user.username },
      categories: cats,
      types,
      expenses: rows.map(({ dto }) => ({
        amount: dto.amount,
        note: dto.note,
        typeName: dto.typeName,
        categoryName: dto.categoryName,
        spentAt: dto.spentAt,
        createdAt: dto.createdAt,
      })),
    };
  });
}
