// --- Minik .env yükleyici (dotenv bağımlılığı istemiyoruz) ---
// Hem çalışma dizininde hem de depo kökünde arar.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';

const envCandidates = [join(process.cwd(), '.env'), join(resolve(process.cwd(), '..'), '.env')];
for (const envPath of envCandidates) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]!] === undefined) {
      process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
    }
  }
}

const b64Key = z
  .string()
  .transform((s) => Buffer.from(s, 'base64'))
  .refine((b) => b.length === 32, {
    message: '32 byte uzunluğunda base64 olmalı (openssl rand -base64 32)',
  });

const schema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_PATH: z.string().default('./data/nomi.db'),
  JWT_SECRET: b64Key,
  MASTER_KEY: b64Key,
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  WEB_ORIGIN: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(
    `\n[Nomi] Ortam değişkenleri geçersiz:\n${details}\n` +
      `Örnek için .env.example dosyasına bak. Anahtar üretmek için: openssl rand -base64 32\n`,
  );
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === 'production';

export const ACCESS_TOKEN_TTL_SEC = 10 * 60; // 10 dakika
export const REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // 7 gün (kayan pencere)
export const REFRESH_COOKIE = 'nomi_rt';
