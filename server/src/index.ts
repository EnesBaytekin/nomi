import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, isProd } from './config.js';
import { cleanupExpiredTokens, migrate } from './db.js';
import { HttpError } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { usersRoutes } from './routes/users.js';
import { catalogRoutes } from './routes/catalog.js';
import { expenseRoutes } from './routes/expenses.js';
import { statsRoutes } from './routes/stats.js';

migrate();

const app = Fastify({
  logger: isProd
    ? { level: 'info' }
    : { level: 'warn' },
  trustProxy: true,
});

await app.register(cookie);
await app.register(cors, {
  origin: config.WEB_ORIGIN ?? true,
  credentials: true,
});

app.setErrorHandler((err, req, reply) => {
  if (err instanceof HttpError) {
    reply.code(err.status).send({ error: err.message, code: err.code, ...(err.extra ?? {}) });
    return;
  }
  if ((err as { validation?: unknown }).validation) {
    reply.code(400).send({ error: 'Geçersiz istek' });
    return;
  }
  req.log.error(err);
  reply.code(500).send({ error: 'Sunucu hatası' });
});

await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(usersRoutes, { prefix: '/api/users' });
await app.register(catalogRoutes, { prefix: '/api' });
await app.register(expenseRoutes, { prefix: '/api' });
await app.register(statsRoutes, { prefix: '/api' });

// Sağlık kontrolü (kimlik doğrulamasız)
app.get('/api/health', () => ({ ok: true, uptime: process.uptime() }));

// Üretimde web arayüzünü aynı süreçten servis et (tek konteyner dağıtımı)
const webDist = resolve(process.cwd(), '..', 'web', 'dist');
if (existsSync(webDist)) {
  const { default: path } = await import('node:path');
  await app.register(fastifyStatic, { root: webDist, prefix: '/' });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api')) {
      reply.sendFile('index.html');
      return;
    }
    reply.code(404).send({ error: 'Bulunamadı' });
  });
} else if (isProd) {
  app.log.warn(`web/dist bulunamadı: ${webDist} — arayüz servis edilmeyecek (npm run build -w web)`);
}

// Süresi geçmiş refresh tokenları periyodik temizle
cleanupExpiredTokens();
const cleanupTimer = setInterval(cleanupExpiredTokens, 60 * 60 * 1000);
cleanupTimer.unref();

await app.listen({ port: config.PORT, host: config.HOST });
