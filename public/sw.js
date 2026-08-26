// Network-first service worker. Only handles THIS origin's navigations and
// hashed /assets/ files. Everything else — Firebase RTDB long-polling, Google
// APIs, Cloud Functions — must go straight to the network. Wrapping those in
// respondWith() is what made a PWA refresh hang until site data was cleared.
const CACHE_NAME = 'dealer-ledger-pro-cache-v4';

// --- Cloud Messaging ------------------------------------------------------
// Owner alerts from the sales agent arrive here as web push. There is no second
// firebase-messaging-sw.js: a page may only have one worker on this scope, and a
// second one would fight the caching worker above. The Firebase config comes in
// on this script's own URL because index.html registers it that way — see the
// comment there. Everything below the try/catch must still run if the CDN is
// blocked or the browser has no push support, or the app loses its cache too.
const fcmParams = new URL(self.location.href).searchParams;
const fcmApiKey = fcmParams.get('fcmKey');
const fcmSenderId = fcmParams.get('fcmSender');
const fcmAppId = fcmParams.get('fcmApp');

if (fcmApiKey && fcmSenderId && fcmAppId) {
  try {
    // Kept in step with the `firebase` version in package.json. The hosting CSP
    // has to allow https://www.gstatic.com in script-src or these are blocked;
    // tests/csp.test.ts checks that it still does.
    importScripts(
      'https://www.gstatic.com/firebasejs/12.7.0/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/12.7.0/firebase-messaging-compat.js'
    );
    firebase.initializeApp({
      apiKey: fcmApiKey,
      projectId: 'motor-ledger-pro',
      messagingSenderId: fcmSenderId,
      appId: fcmAppId,
    });
    // Constructing it is the whole job. The SDK installs its own push and
    // notificationclick listeners: a background alert is shown from the
    // notification block of the payload, a tap focuses an already-open tab at
    // webpush.fcmOptions.link (or opens one), and an alert arriving while a tab
    // is visible is forwarded to that tab instead — which is what onMessage in
    // services/pushService.ts turns into a toast.
    firebase.messaging();
  } catch (err) {
    console.warn('[SW] Cloud Messaging is not available in this worker', err);
  }
}

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
