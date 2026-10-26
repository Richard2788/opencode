/* Snuffly's Carnival — Service Worker (PWA offline básico) */
const CACHE = 'snuffly-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/jogos.html',
  '/premios.html',
  '/sobre.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/favicon.png',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/img/logo.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  // API: network-first, sem cachear falhas
  if (request.url.includes('/api/')) {
    e.respondWith(
      fetch(request).catch(() => caches.match(request).then((r) => r || new Response(
        JSON.stringify({ error: 'offline' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )))
    );
    return;
  }

  // Demais recursos: cache-first com atualização em background
  e.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
