// ============================================================
// BizFlow Técnico – Service Worker
// Cache-first para assets estáticos, network-first para API
// ============================================================

const CACHE_NAME = 'bizflow-tecnico-v1';

const STATIC_ASSETS = [
  '/tecnico/app.html',
  '/tecnico/app.js',
  '/tecnico/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-regular-400.woff2',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando assets estáticos');
      // Cache local assets first, then try CDN assets (don't fail on CDN)
      return cache.addAll(STATIC_ASSETS.slice(0, 4)).catch(() => {
        console.warn('[SW] Algunos assets CDN no pudieron cachearse');
      });
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Eliminando caché antigua:', name);
            return caches.delete(name);
          })
      )
    )
  );
  self.clients.claim();
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-first para llamadas a la API
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first para assets estáticos (local and CDN)
  event.respondWith(cacheFirst(request));
});

// ── Estrategia: Cache First ──────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Fallback offline: devolver app.html para navegación
    if (request.mode === 'navigate') {
      const cached = await caches.match('/tecnico/app.html');
      if (cached) return cached;
    }
    return new Response('Sin conexión', { status: 503, statusText: 'Offline' });
  }
}

// ── Estrategia: Network First ────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Sin conexión' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── BACKGROUND SYNC STUB ────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-photos') {
    console.log('[SW] Background sync: sync-photos');
    event.waitUntil(syncPendingPhotos());
  }
  if (event.tag === 'sync-location') {
    console.log('[SW] Background sync: sync-location');
    event.waitUntil(syncPendingLocation());
  }
});

async function syncPendingPhotos() {
  // Stub: retrieve pending photo uploads from IndexedDB and retry
  console.log('[SW] Procesando fotos pendientes...');
  // Implementation would read from IndexedDB and POST to /api/tecnico/ordenes/[id]/fotos
}

async function syncPendingLocation() {
  // Stub: send last known GPS position
  console.log('[SW] Enviando ubicación pendiente...');
  // Implementation would read from IndexedDB and PUT to /api/tecnico/ubicacion
}

// ── PUSH NOTIFICATION STUB ──────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification recibida');
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'BizFlow';
  const options = {
    body: data.body || 'Tienes una nueva notificación',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: data.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const urlToOpen = data.url || '/tecnico/app.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/tecnico/') && 'focus' in client) {
          client.focus();
          return;
        }
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});
