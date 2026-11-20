# ---------- 1. Aşama: web istemcisini derle ----------
FROM node:22-bookworm-slim AS build

WORKDIR /app

# Bağımlılık manifestleri (Docker katman önbelleği için önce bunlar)
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund

# Web istemcisi: typecheck + vite build → web/dist
COPY web/ web/
RUN npm run build -w web

# ---------- 2. Aşama: çalışma zamanı ----------
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    DB_PATH=/app/data/nomi.db \
    PORT=3000

WORKDIR /app

# Sadece üretim bağımlılıkları (tsx artık prod dependency)
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Sunucu kaynakları (tsx ile çalışır) + derlenmiş istemci
COPY server/src server/src
COPY --from=build /app/web/dist web/dist

# Veritabanı klasörü (volume bağlanacak)
RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 3000

# Sağlık kontrolü: kimlik doğrulama gerektirmeyen durum ucu
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app
CMD ["npm", "start"]
