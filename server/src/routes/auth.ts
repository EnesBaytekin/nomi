import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  assertNotRateLimited,
  authGuard,
  clearAuthFailures,
  createRefreshToken,
  readRefreshCookie,
  recordAuthFailure,
  revokeAllUserTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  signAccessToken,
} from '../auth.js';
import { verifyPassword, hashPassword } from '../password.js';
import { countUsers, createUser, publicUser } from '../users.js';
import { db, type UserRow } from '../db.js';
import { HttpError } from '../errors.js';
import { parse } from '../util.js';

const credentials = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'en az 3 karakter')
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'yalnızca harf, rakam, nokta, tire ve alt çizgi'),
  password: z.string().min(8, 'en az 8 karakter').max(128),
});

function getUserByUsername(username: string): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE`).get(username) as
    | UserRow
    | undefined;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Kurulum gerekli mi? (ilk kullanıcı yoksa kurulum ekranı gösterilir)
  app.get('/status', async () => ({ needsSetup: countUsers() === 0 }));

  // İlk kullanıcı (yönetici) kurulumu
  app.post('/setup', async (req, reply) => {
    if (countUsers() > 0) throw new HttpError(403, 'Kurulum tamamlandı. Lütfen giriş yapın.');
    const { username, password } = parse(credentials, req.body);
    const user = createUser(username, password, true);
    const token = createRefreshToken(user.id, crypto.randomUUID(), req.headers['user-agent']);
    setRefreshCookie(reply, token);
    return { accessToken: signAccessToken(user), user: publicUser(user) };
  });

  app.post('/login', async (req, reply) => {
    const { username, password } = parse(credentials, req.body);
    const key = `${req.ip}:${username.toLowerCase()}`;
    assertNotRateLimited(key);

    const user = getUserByUsername(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      recordAuthFailure(key);
      throw new HttpError(401, 'Kullanıcı adı veya parola hatalı');
    }
    clearAuthFailures(key);
    const token = createRefreshToken(user.id, crypto.randomUUID(), req.headers['user-agent']);
    setRefreshCookie(reply, token);
    return { accessToken: signAccessToken(user), user: publicUser(user) };
  });

  // Kayan pencere: her çağrıda refresh token döndürülür ve 7 günlük süre tazelenir
  app.post('/refresh', async (req, reply) => {
    const token = readRefreshCookie(req);
    if (!token) throw new HttpError(401, 'Oturum bulunamadı', 'NO_SESSION');
    const { user, newToken } = rotateRefreshToken(token, req.headers['user-agent']);
    setRefreshCookie(reply, newToken);
    return { accessToken: signAccessToken(user), user: publicUser(user) };
  });

  app.post('/logout', async (req, reply) => {
    const token = readRefreshCookie(req);
    if (token) revokeRefreshToken(token);
    clearRefreshCookie(reply);
    return { ok: true };
  });

  app.get('/me', { preHandler: authGuard }, async (req) => publicUser(req.user));

  // Parola değişikliği: diğer tüm oturumlar iptal edilir, bu cihaz için yeni token üretilir
  app.post('/password', { preHandler: authGuard }, async (req, reply) => {
    const { currentPassword, newPassword } = parse(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8, 'en az 8 karakter').max(128),
      }),
      req.body,
    );
    if (!verifyPassword(currentPassword, req.user.password_hash)) {
      throw new HttpError(400, 'Mevcut parola hatalı');
    }
    if (verifyPassword(newPassword, req.user.password_hash)) {
      throw new HttpError(400, 'Yeni parola eskisiyle aynı olamaz');
    }
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hashPassword(newPassword), req.user.id);
    revokeAllUserTokens(req.user.id);
    const fresh = getUserByUsername(req.user.username)!;
    const token = createRefreshToken(fresh.id, crypto.randomUUID(), req.headers['user-agent']);
    setRefreshCookie(reply, token);
    return { accessToken: signAccessToken(fresh) };
  });
}
