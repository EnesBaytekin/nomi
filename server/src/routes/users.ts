import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adminGuard, authGuard } from '../auth.js';
import { db } from '../db.js';
import { HttpError } from '../errors.js';
import { parse } from '../util.js';
import { createUser, publicUser } from '../users.js';

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', adminGuard);

  app.get('/', async () => {
    const rows = db.prepare(`SELECT * FROM users ORDER BY created_at ASC`).all() as Array<
      Parameters<typeof publicUser>[0]
    >;
    return { users: rows.map(publicUser) };
  });

  app.post('/', async (req) => {
    const { username, password } = parse(
      z.object({
        username: z
          .string()
          .trim()
          .min(3, 'en az 3 karakter')
          .max(32)
          .regex(/^[a-zA-Z0-9_.-]+$/, 'yalnızca harf, rakam, nokta, tire ve alt çizgi'),
        password: z.string().min(8, 'en az 8 karakter').max(128),
      }),
      req.body,
    );
    const exists = db.prepare(`SELECT 1 FROM users WHERE username = ? COLLATE NOCASE`).get(username);
    if (exists) throw new HttpError(409, 'Bu kullanıcı adı zaten kullanılıyor');
    const user = createUser(username, password, false);
    return { user: publicUser(user) };
  });

  app.delete('/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    if (id === req.user.id) throw new HttpError(400, 'Kendini silemezsin');
    const target = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as
      | { id: string; is_admin: number }
      | undefined;
    if (!target) throw new HttpError(404, 'Kullanıcı bulunamadı');
    if (target.is_admin === 1) {
      const admins = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE is_admin = 1`).get() as { c: number };
      if (admins.c <= 1) throw new HttpError(400, 'Son yönetici silinemez');
    }
    db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
    return { ok: true };
  });
}
