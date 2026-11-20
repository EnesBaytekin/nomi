import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config.js';

mkdirSync(dirname(resolve(config.DB_PATH)), { recursive: true });

export const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  wrapped_dek: string;
  token_version: number;
  is_admin: number;
  created_at: number;
}

export interface CategoryRow {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  created_at: number;
}

export interface TypeRow {
  id: string;
  user_id: string;
  category_id: string;
  name: string;
  icon: string;
  archived: number;
  sort_order: number;
  created_at: number;
}

export interface ExpenseRow {
  id: string;
  user_id: string;
  type_id: string;
  spent_at: number;
  data: string; // şifreli {a: kuruş, n: not}
  created_at: number;
  updated_at: number;
}

const MIGRATIONS: string[] = [
  // 001 — ilk şema
  `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    wrapped_dek   TEXT NOT NULL,
    token_version INTEGER NOT NULL DEFAULT 0,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id  TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    user_agent TEXT,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_refresh_user   ON refresh_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens(family_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_expiry ON refresh_tokens(expires_at);

  CREATE TABLE IF NOT EXISTS categories (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    icon       TEXT NOT NULL DEFAULT '🏷️',
    color      TEXT NOT NULL DEFAULT '#34d399',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);

  CREATE TABLE IF NOT EXISTS expense_types (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name        TEXT NOT NULL,
    icon        TEXT NOT NULL DEFAULT '💸',
    archived    INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_types_user ON expense_types(user_id);
  CREATE INDEX IF NOT EXISTS idx_types_cat  ON expense_types(category_id);

  CREATE TABLE IF NOT EXISTS expenses (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type_id    TEXT NOT NULL REFERENCES expense_types(id) ON DELETE RESTRICT,
    spent_at   INTEGER NOT NULL,
    data       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_user_time ON expenses(user_id, spent_at DESC);
  CREATE INDEX IF NOT EXISTS idx_expenses_type      ON expenses(type_id);
  `,
];

export function migrate(): void {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  const current = Number((db.prepare(`SELECT value FROM meta WHERE key='schema_version'`).get() as any)?.value ?? 0);
  for (let v = current; v < MIGRATIONS.length; v++) {
    const run = db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.prepare(
        `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(String(v + 1));
    });
    run();
  }
}

/** Dönemsel temizlik: süresi çok uzun önce dolmuş refresh tokenları sil */
export function cleanupExpiredTokens(): void {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 günden eskiler
  db.prepare(`DELETE FROM refresh_tokens WHERE expires_at < ?`).run(cutoff);
}
