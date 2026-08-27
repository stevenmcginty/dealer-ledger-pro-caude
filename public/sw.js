// Network-first service worker. Only handles THIS origin's navigations and
// hashed /assets/ files. Everything else — Firebase RTDB long-polling, Google
// APIs, Cloud Functions — must go straight to the network. Wrapping those in
// respondWith() is what made a PWA refresh hang until site data was cleared.
const CACHE_NAME = 'dealer-ledger-pro-cache-v8';

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

const daveFromNotification = (notification) => {
  const payload = (notification && notification.data) || {};
  const inner = payload.FCM_MSG || payload;
  const data = inner.data || payload;
  const convId = String((data && data.convId) || payload.convId || '');
  const kind = String((data && data.kind) || payload.kind || '');
  return { convId, kind };
};

const daveUrl = (convId, action) => {
  const params = new URLSearchParams();
  if (convId) params.set('dave', convId);
  if (action === 'approve') params.set('daveAction', 'approve');
  const query = params.toString();
  return self.location.origin + '/app' + (query ? '?' + query : '');
};

const openDaveFromNotification = async (convId, action) => {
  const type = action === 'approve' ? 'dlp:dave-approve' : 'dlp:dave-review';
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    try {
      client.postMessage({ type, convId });
    } catch (_) {}
    if (client.focus) {
      await client.focus();
      return;
    }
  }
  if (self.clients.openWindow) {
    await self.clients.openWindow(daveUrl(convId, action));
  }
};

// Own the push too. The Firebase SDK stays quiet when a tab is visible and hands
// the message to the page instead, which on a phone means no shade entry while
// the app happens to be open. Steve wants it in the bar every time, so this shows
// it first and stops the SDK from deciding. The page is still told, so the bell
// opens on whatever screen is showing.
self.addEventListener('push', event => {
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation();
  }
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { notification: { title: 'Dave', body: event.data ? event.data.text() : '' } };
  }
  const n = payload.notification || {};
  const d = payload.data || {};
  const convId = String(d.convId || '');
  const kind = String(d.kind || '');
  const isDraft = kind === 'draft';
  const isQuestion = kind === 'question';
  const actions = isDraft
    ? [{ action: 'approve', title: 'Approve' }, { action: 'review', title: 'Edit' }]
    : isQuestion
      ? [{ action: 'review', title: 'Answer' }]
      : [{ action: 'review', title: 'Open' }];

  event.waitUntil((async () => {
    await self.registration.showNotification(n.title || 'Dave', {
      body: n.body || '',
      icon: n.icon || '/icons/icon-192.png',
      badge: n.badge || '/icons/badge-96.png',
      tag: n.tag || convId || kind || 'dave',
      renotify: true,
      requireInteraction: isDraft || isQuestion,
      vibrate: [80, 40, 80, 40, 120],
      data: { convId, kind, url: d.url || '' },
      actions,
    });
    try {
      const notes = await self.registration.getNotifications();
      const badgeCount = notes.length;
      if (self.navigator && typeof self.navigator.setAppBadge === 'function') {
        if (badgeCount > 0) await self.navigator.setAppBadge(badgeCount);
        else await self.navigator.clearAppBadge();
      }
    } catch (_) {}
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      try {
        client.postMessage({ type: 'dlp:dave-alert', convId, kind, title: n.title || 'Dave', body: n.body || '' });
      } catch (_) {}
    }
  })());
});

// Own the tap. Registered before firebase.messaging() so we run first and can
// stop FCM opening Settings / a second window. On a phone the shade buttons
// (Approve / Edit) land here as event.action.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation();
  }

  const { convId } = daveFromNotification(event.notification);
  const action = event.action === 'approve' ? 'approve' : 'review';
  event.waitUntil(openDaveFromNotification(convId, action));
});

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
    // Shows the alert from the payload and forwards a visible-tab push to
    // onMessage. Clicks are handled above, not by the SDK.
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
