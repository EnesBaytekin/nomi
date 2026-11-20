import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { preHandlerHookHandler } from 'fastify';
import {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_COOKIE,
  REFRESH_TTL_SEC,
  config,
} from './config.js';
import { db, type UserRow } from './db.js';
import { HttpError } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow;
  }
}

// --- JWT (kısa ömürlü erişim tokenı) ---

export function signAccessToken(user: UserRow): string {
  return jwt.sign({ tv: user.token_version }, config.JWT_SECRET, {
    subject: user.id,
    expiresIn: ACCESS_TOKEN_TTL_SEC,
    issuer: 'nomi',
  });
}

interface AccessPayload {
  sub: string;
  tv: number;
}

export function verifyAccessToken(token: string): AccessPayload {
  const payload = jwt.verify(token, config.JWT_SECRET, { issuer: 'nomi' });
  if (typeof payload === 'string' || typeof payload.sub !== 'string') {
    throw new HttpError(401, 'Oturum geçersiz', 'TOKEN_INVALID');
  }
  return { sub: payload.sub, tv: Number((payload as { tv?: number }).tv ?? 0) };
}

// --- Refresh token (döndürümlü, kayan pencere) ---

const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

export function getUserById(id: string): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
}

export function createRefreshToken(userId: string, familyId: string, userAgent?: string): string {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, user_agent, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    userId,
    familyId,
    sha256(token),
    userAgent ?? null,
    Date.now() + REFRESH_TTL_SEC * 1000,
    Date.now(),
  );
  return token;
}

export function setRefreshCookie(reply: { setCookie: Function; clearCookie: Function }, token: string): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    path: '/api/auth',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    maxAge: REFRESH_TTL_SEC,
  });
}

export function clearRefreshCookie(reply: { clearCookie: Function }): void {
  reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

export function readRefreshCookie(req: { cookies: Record<string, string | undefined> }): string | undefined {
  return req.cookies[REFRESH_COOKIE];
}

/** Yeniden kullanım tespiti: dönüştürülmüş/iptal edilmiş token tekrar sunulursa
 *  çalınma ihtimaline karşı tüm token ailesi iptal edilir. */
export function rotateRefreshToken(
  token: string,
  userAgent?: string,
): { user: UserRow; newToken: string } {
  const row = db
    .prepare(`SELECT * FROM refresh_tokens WHERE token_hash = ?`)
    .get(sha256(token)) as
    | { id: string; user_id: string; family_id: string; expires_at: number; used_at: number | null; revoked_at: number | null }
    | undefined;
  if (!row) throw new HttpError(401, 'Oturum bulunamadı', 'NO_SESSION');

  const now = Date.now();
  if (row.used_at !== null || row.revoked_at !== null) {
    db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL`).run(
      now,
      row.family_id,
    );
    throw new HttpError(401, 'Oturum güvenlik nedeniyle kapatıldı', 'REUSE_DETECTED');
  }
  if (row.expires_at < now) throw new HttpError(401, 'Oturum süresi doldu', 'SESSION_EXPIRED');

  const user = getUserById(row.user_id);
  if (!user) throw new HttpError(401, 'Oturum geçersiz', 'TOKEN_INVALID');

  db.prepare(`UPDATE refresh_tokens SET used_at = ? WHERE id = ?`).run(now, row.id);
  // Kayan pencere: her yenilemede süre yeniden 7 gün olur
  const newToken = createRefreshToken(user.id, row.family_id, userAgent);
  return { user, newToken };
}

export function revokeRefreshToken(token: string): void {
  db.prepare(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL AND used_at IS NULL`,
  ).run(Date.now(), sha256(token));
}

export function revokeAllUserTokens(userId: string): void {
  db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).run(
    Date.now(),
    userId,
  );
}

// --- Koruma (guard) ---

export const authGuard: preHandlerHookHandler = async (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Yetkilendirme gerekli', 'NO_TOKEN');
  }
  let payload: AccessPayload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const name = (e as { name?: string }).name;
    if (name === 'TokenExpiredError') throw new HttpError(401, 'Oturum süresi doldu', 'TOKEN_EXPIRED');
    throw new HttpError(401, 'Oturum geçersiz', 'TOKEN_INVALID');
  }
  const user = getUserById(payload.sub);
  if (!user || user.token_version !== payload.tv) {
    throw new HttpError(401, 'Oturum geçersiz', 'TOKEN_INVALID');
  }
  req.user = user;
};

export const adminGuard: preHandlerHookHandler = async (req) => {
  if (!req.user.is_admin) throw new HttpError(403, 'Bu işlem için yönetici yetkisi gerekli');
};

// --- Basit brute-force koruması (bellek içi) ---

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const failures = new Map<string, { count: number; until: number }>();

export function assertNotRateLimited(key: string): void {
  const entry = failures.get(key);
  if (entry && entry.until > Date.now() && entry.count >= MAX_FAILURES) {
    const mins = Math.ceil((entry.until - Date.now()) / 60000);
    throw new HttpError(429, `Çok fazla hatalı deneme. ${mins} dakika sonra tekrar dene.`);
  }
}

export function recordAuthFailure(key: string): void {
  const entry = failures.get(key);
  if (!entry || entry.until <= Date.now()) {
    failures.set(key, { count: 1, until: Date.now() + WINDOW_MS });
    return;
  }
  entry.count += 1;
  entry.until = Date.now() + WINDOW_MS;
}

export function clearAuthFailures(key: string): void {
  failures.delete(key);
}
