// Muragoods Service Worker v3 — Full PWA with Offline Menu Browsing
// v3: dashboard NEVER intercepted (always fresh from the network) and cache
// generation bumped so older deployments' caches are dropped on activate.
const CACHE_NAME = 'muragoods-v4';
const CACHE_NAME_STATIC = 'muragoods-static-v4';
const CACHE_NAME_MENU = 'muragoods-menu-v4';
const CACHE_NAME_API = 'muragoods-api-v4';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/menu',
  '/hub',
  '/login',
  '/signup',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/images/muragoods-logo.png',
  '/images/product-musubi.png',
  '/images/product-churros.png',
  '/images/product-cheesy-bread.svg',
];

// API routes to cache for offline browsing
const API_ROUTES_TO_CACHE = [
  '/api/products',
];

// ─── Install ───────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME_STATIC)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(PRECACHE_URLS).catch((err) => {
          console.warn('[SW] Some precache items failed:', err);
          // Cache what we can
          return Promise.allSettled(
            PRECACHE_URLS.map(url => cache.add(url).catch(() => null))
          );
        });
      })
  );
  self.skipWaiting();
});

// ─── Activate ──────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME_STATIC && name !== CACHE_NAME_MENU && name !== CACHE_NAME_API)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// ─── Fetch Strategy ────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip admin pages, checkout, and auth-related pages (should always be fresh)
  const skipPaths = ['/admin', '/checkout', '/api/auth'];
  if (skipPaths.some(p => url.pathname.startsWith(p))) return;

  // Skip the bot dashboard and its APIs entirely: it must always reflect the
  // latest deployment, never a cached shell. (An old SW version pinning the
  // dashboard is exactly how users end up on a UI that no longer exists.)
  if (url.pathname.startsWith('/dashboard') || url.pathname.startsWith('/api/dashboard')) return;

  // API requests: Network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request, CACHE_NAME_API, 60 * 60 * 1000)); // 1 hour
    return;
  }

  // Menu/product page: Stale-while-revalidate (show cached instantly, update in background)
  if (url.pathname === '/menu' || url.pathname.startsWith('/menu')) {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAME_MENU));
    return;
  }

  // Static assets (images, CSS, JS): Cache first — but never cache JS chunks
  // on localhost: dev chunk filenames are stable while their content changes,
  // so cache-first would serve stale code after every edit.
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const isJsChunk = url.pathname.startsWith('/_next/static/') && /\.js(\?|$)/.test(url.pathname);
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/images/') || url.pathname.startsWith('/icons/')) {
    if (!(isLocalhost && isJsChunk)) {
      event.respondWith(cacheFirst(request, CACHE_NAME_STATIC));
      return;
    }
    // Dev JS chunks: straight through to the network.
    return;
  }

  // Navigation requests (pages): Network first, offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // Everything else: Network first with cache fallback
  event.respondWith(networkFirstWithCache(request, CACHE_NAME_STATIC, 30 * 60 * 1000));
});

// ─── Cache Strategies ──────────────────────────────────────────

// Cache First — for static assets that rarely change
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

// Stale While Revalidate — show cache immediately, update in background
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

// Network First with Cache Fallback
async function networkFirstWithCache(request, cacheName, maxAge) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ success: false, error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Network First with Offline Fallback — for page navigation
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME_STATIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Try to serve from cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Serve offline page
    const offlinePage = await caches.match('/');
    if (offlinePage) return offlinePage;

    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Muragoods — Offline</title>
        <style>
          body {
            background: #0f0f1a;
            color: #e8e8f0;
            font-family: 'Segoe UI', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            text-align: center;
          }
          .container { max-width: 400px; padding: 40px; }
          h1 { color: #ffd60a; font-size: 24px; margin-bottom: 12px; }
          p { color: #9090a8; font-size: 14px; line-height: 1.6; }
          .icon { font-size: 48px; margin-bottom: 20px; }
          button {
            margin-top: 20px;
            padding: 12px 24px;
            background: #ffd60a;
            color: #0f0f1a;
            border: none;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon" style="display:flex;justify-content:center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ffd60a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="#ffd60a"/></svg>
        </div>
          <h1>You're Offline</h1>
          <p>No internet connection detected. Your previously viewed menu items are still available!</p>
          <button onclick="location.reload()">Try Again</button>
        </div>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

// ─── Push Notifications ────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Muragoods';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    data: data.url || '/',
    actions: data.actions || [],
    tag: data.tag || 'muragoods-notification',
    renotify: true,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── Notification Click ────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  event.notification.close();

  // Handle notification actions
  let url = event.notification.data || '/';
  if (action === 'dismiss') return;
  if (action === 'view' || action === 'open') {
    url = event.notification.data || '/';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Open new window
      self.clients.openWindow(url);
    })
  );
});

// ─── Push Subscription Management ──────────────────────────────
self.addEventListener('pushsubscriptionchange', (event) => {
  // Re-subscribe when subscription expires
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options).then((subscription) => {
      // Notify the server about the new subscription
      return fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
    })
  );
});

// ─── Message Handler — for cache invalidation from the app ─────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_MENU_CACHE') {
    caches.delete(CACHE_NAME_MENU).then(() => {
      console.log('[SW] Menu cache cleared');
    });
  }

  if (event.data && event.data.type === 'CLEAR_ALL_CACHES') {
    caches.keys().then((names) => {
      names.forEach(name => caches.delete(name));
      console.log('[SW] All caches cleared');
    });
  }
});
