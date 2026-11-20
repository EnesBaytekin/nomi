import crypto from 'node:crypto';
import { config } from './config.js';
import { wrapDek } from './crypto.js';
import { db, type UserRow } from './db.js';
import { hashPassword } from './password.js';
import { seedDefaultsForUser } from './seed.js';
import { getUserById } from './auth.js';

export function createUser(username: string, password: string, isAdmin = false): UserRow {
  const dek = crypto.randomBytes(32);
  const wrapped = wrapDek(dek, config.MASTER_KEY);
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, wrapped_dek, token_version, is_admin, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, username, hashPassword(password), wrapped, isAdmin ? 1 : 0, Date.now());
  seedDefaultsForUser(db, id);
  return getUserById(id)!;
}

export function publicUser(u: UserRow): {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: number;
} {
  return { id: u.id, username: u.username, isAdmin: u.is_admin === 1, createdAt: u.created_at };
}

export function countUsers(): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number }).c;
}
