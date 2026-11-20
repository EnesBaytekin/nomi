/* Nomi service worker — uygulama kabuğunu önbelleğe alır, API her zaman ağdan gelir. */
const VERSION = 'nomi-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/app.css',
  '/js/api.js',
  '/js/auth.js',
  '/js/charts.js',
  '/js/dom.js',
  '/js/format.js',
  '/js/icons.js',
  '/js/layout.js',
  '/js/main.js',
  '/js/stats.js',
  '/js/views/history.js',
  '/js/views/home.js',
  '/js/views/login.js',
  '/js/views/settings.js',
  '/js/views/stats.js',
  '/favicon.svg',
  '/favicon-maskable.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // API istekleri önbelleklenmez — veri her zaman güncel ve sunucudan.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  if (req.method !== 'GET') return;

  // Sayfa gezinmeleri: önce ağ, olmazsa kabuk (çevrimdışı destek).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Aynı kaynak statik dosyalar: önbellekten ver, arkada güncelle.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
