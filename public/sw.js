// Network-first service worker. Replaces the old cache-first-forever v1 worker:
// pages are always fetched fresh (so deploys reach the browser immediately),
// hashed static assets are cached, and all old caches are purged on activation.
const CACHE_NAME = 'dealer-ledger-pro-cache-v3';

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

  const url = new URL(req.url);
  // Never cache the version probe or the worker itself — the in-app Update
  // button polls /version.json to know a deploy landed.
  if (url.origin === self.location.origin && (url.pathname === '/version.json' || url.pathname === '/sw.js')) {
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

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    // Only cache same-origin hashed build assets; their filenames change per deploy.
    if (res.ok && new URL(req.url).origin === self.location.origin && req.url.includes('/assets/')) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  })());
});
