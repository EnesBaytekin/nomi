import crypto from 'node:crypto';
import type { db } from './db.js';

/**
 * Yeni kullanıcı için varsayılan kategori ve harcama türleri.
 * Kullanıcı bunları ayarlardan dilediği gibi düzenleyebilir.
 */
const DEFAULTS: Array<{
  name: string;
  icon: string;
  color: string;
  types: Array<{ name: string; icon: string }>;
}> = [
  { name: 'Yeme İçme', icon: '🍽️', color: '#34d399', types: [{ name: 'Yemek', icon: '🍲' }, { name: 'Abur cubur', icon: '🍫' }] },
  { name: 'Ulaşım', icon: '🚌', color: '#38bdf8', types: [{ name: 'Ulaşım', icon: '🚕' }] },
  { name: 'Teknoloji', icon: '💻', color: '#a78bfa', types: [{ name: 'Yapay zeka', icon: '🤖' }, { name: 'Sunucu', icon: '🖥️' }, { name: 'Telefon', icon: '📱' }] },
  { name: 'Yatırım', icon: '📈', color: '#fbbf24', types: [{ name: 'Altın', icon: '🪙' }, { name: 'Borsa', icon: '📊' }] },
  { name: 'Yaşam', icon: '🏠', color: '#fb7185', types: [{ name: 'Hediye', icon: '🎁' }, { name: 'Kişisel', icon: '🧴' }, { name: 'Eğlence', icon: '🎮' }] },
  { name: 'Seyahat', icon: '✈️', color: '#2dd4bf', types: [{ name: 'Konaklama', icon: '🛏️' }] },
];

export function seedDefaultsForUser(database: typeof db, userId: string): void {
  const insCat = database.prepare(
    `INSERT INTO categories (id, user_id, name, icon, color, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insType = database.prepare(
    `INSERT INTO expense_types (id, user_id, category_id, name, icon, archived, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  );
  const now = Date.now();
  const tx = database.transaction(() => {
    DEFAULTS.forEach((cat, ci) => {
      const catId = crypto.randomUUID();
      insCat.run(catId, userId, cat.name, cat.icon, cat.color, (ci + 1) * 10, now);
      cat.types.forEach((t, ti) => {
        insType.run(crypto.randomUUID(), userId, catId, t.name, t.icon, (ti + 1) * 10, now);
      });
    });
  });
  tx();
}
