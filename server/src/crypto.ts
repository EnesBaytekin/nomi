import crypto from 'node:crypto';

/**
 * Şifreleme mimarisi:
 *  - MASTER_KEY  (ortam değişkeni): her kullanıcının veri anahtarını (DEK) sarar.
 *  - DEK (kullanıcı başına rastgele 32 byte): o kullanıcının hassas verilerini
 *    (harcama tutarı + not) AES-256-GCM ile şifreler.
 * Böylece veritabanı dosyası ele geçse bile, MASTER_KEY olmadan hiçbir
 * kullanıcının verisi okunamaz; anahtar döndürme de tek noktadan yapılabilir.
 */

const BLOCK = 12; // GCM IV
const TAG = 16; // GCM auth tag
const PREFIX = 'v1'; // ileride algoritma değişirse çözümleme için

export function seal(key: Buffer, plaintext: Buffer): string {
  const iv = crypto.randomBytes(BLOCK);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}.${Buffer.concat([iv, tag, ct]).toString('base64')}`;
}

export function open(key: Buffer, blob: string): Buffer {
  const [ver, body] = blob.split('.');
  if (ver !== PREFIX || !body) throw new Error('Şifreli veri biçimi geçersiz');
  const raw = Buffer.from(body, 'base64');
  const iv = raw.subarray(0, BLOCK);
  const tag = raw.subarray(BLOCK, BLOCK + TAG);
  const ct = raw.subarray(BLOCK + TAG);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Kullanıcı veri anahtarını (DEK) ana anahtarla sarmalar */
export function wrapDek(dek: Buffer, masterKey: Buffer): string {
  return seal(masterKey, dek);
}

export function unwrapDek(wrapped: string, masterKey: Buffer): Buffer {
  return open(masterKey, wrapped);
}

/** Hassas JSON yüklerini (tutar + not) şifreler / çözer */
export function sealJson(key: Buffer, value: unknown): string {
  return seal(key, Buffer.from(JSON.stringify(value), 'utf8'));
}

export function openJson<T>(key: Buffer, blob: string): T {
  return JSON.parse(open(key, blob).toString('utf8')) as T;
}
