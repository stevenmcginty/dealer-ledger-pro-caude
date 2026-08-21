// Network-first service worker. Only handles THIS origin's navigations and
// hashed /assets/ files. Everything else — Firebase RTDB long-polling, Google
// APIs, Cloud Functions — must go straight to the network. Wrapping those in
// respondWith() is what made a PWA refresh hang until site data was cleared.
const CACHE_NAME = 'dealer-ledger-pro-cache-v4';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Do not intercept cross-origin traffic. Firebase Realtime Database falls
  // back to HTTP long-polling on iOS PWAs; a service worker that respondWith()s
  // those requests buffers them until they time out.
  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/version.json' || url.pathname === '/sw.js') {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('/index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  if (!url.pathname.startsWith('/assets/')) return;

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  })());
});
