import { config } from './config.js';
import { openJson, sealJson, unwrapDek } from './crypto.js';
import type { UserRow } from './db.js';

/**
 * Kullanıcı başına veri anahtarı (DEK) önbelleği.
 * DEK, kullanıcı kaydı sırasında rastgele üretilir ve MASTER_KEY ile sarılı
 * saklanır. Burada çözülüp bellekte tutulur; veritabanında asla açık durmaz.
 */
const dekCache = new Map<string, Buffer>();

export function getUserDek(user: UserRow): Buffer {
  let dek = dekCache.get(user.id);
  if (!dek) {
    dek = unwrapDek(user.wrapped_dek, config.MASTER_KEY);
    if (dekCache.size > 500) dekCache.clear();
    dekCache.set(user.id, dek);
  }
  return dek;
}

export interface ExpensePayload {
  a: number; // tutar (kuruş)
  n: string | null; // not
}

export function sealExpense(user: UserRow, amount: number, note: string | null): string {
  return sealJson(getUserDek(user), { a: amount, n: note } satisfies ExpensePayload);
}

export function openExpense(user: UserRow, blob: string): ExpensePayload {
  return openJson<ExpensePayload>(getUserDek(user), blob);
}
