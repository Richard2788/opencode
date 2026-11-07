/* Snuffly's Carnival — Service Worker (PWA offline)
   - Pré-cache dos recursos estáticos na instalação
   - Cache-first com atualização em background para estáticos
   - Network-first para a API
   - Fallback offline.html para navegações sem rede            */
const CACHE = 'snuffly-v25';
const ASSETS = [
  '/',
  '/index.html',
  '/jogos.html',
  '/premios.html',
  '/sobre.html',
  '/offline.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/favicon.png',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png',
  '/img/logo.png',
  '/img/logo-512.webp',
  "/assets/audio/extreme fever music.mp3", // música do EXTREME FEVER (Cup Pong)
  // Jogo: Adivinha o Meu Número
  '/jogos/adivinha-numero/',
  '/jogos/scores-comum.js',
  // Jogo: Adivinha o Meu Número
  '/jogos/adivinha-numero/',
  '/jogos/adivinha-numero/index.html',
  '/jogos/adivinha-numero/style.css',
  '/jogos/adivinha-numero/game.js',
  // Jogo: Hack da Torre de Copos
  '/jogos/hack-torre-copos/',
  '/jogos/hack-torre-copos/index.html',
  '/jogos/hack-torre-copos/style.css',
  '/jogos/hack-torre-copos/game.js',
  '/jogos/hack-torre-copos/audio.js',
  // Jogo: Tomba-copos
  '/jogos/tomba-copos/',
  '/jogos/tomba-copos/index.html',
  '/jogos/tomba-copos/css/style.css',
  '/jogos/tomba-copos/js/game.js',
  '/jogos/tomba-copos/js/app.js',
  '/jogos/tomba-copos/assets/papercraft.svg',
  // Jogo: Cup Pong
  '/jogos/cup-pong/',
  '/jogos/cup-pong/index.html',
  '/jogos/cup-pong/styles.css',
  '/jogos/cup-pong/js/config.js',
  '/jogos/cup-pong/js/store.js',
  '/jogos/cup-pong/js/audio.js',
  '/jogos/cup-pong/js/render.js',
  '/jogos/cup-pong/js/game.js',
  '/jogos/cup-pong/js/ui.js',
  '/jogos/cup-pong/js/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  // API: network-first, cai para o cache e por fim para um 503 JSON
  // (compara apenas o pathname — URLs externas que só CONTENHAM "/api/" não devem casar)
  if (new URL(request.url).pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          // guarda a última resposta boa da API para uso offline
          const clone = res.clone();
          caches
            .open(CACHE)
            .then((c) => c.put(request, clone))
            .catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(request).then(
            (r) =>
              r ||
              new Response(JSON.stringify({ error: 'offline' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              })
          )
        )
    );
    return;
  }

  // Navegações: network-first com fallback offline.html
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches
            .open(CACHE)
            .then((c) => c.put(request, clone))
            .catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/offline.html')))
    );
    return;
  }

  // Demais recursos: cache-first com atualização em background
  e.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches
            .open(CACHE)
            .then((c) => c.put(request, clone))
            .catch(() => {});
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
