// ============================================================
// BizFlow Técnico – Service Worker
// Cache-first para assets estáticos, network-first para API
// ============================================================

const CACHE_NAME = 'bizflow-tecnico-v1';

const STATIC_ASSETS = [
  '/tecnico/app.html',
  '/tecnico/app.js',
  '/tecnico/manifest.json',
  '/public/icon-192.png',
  '/public/icon-512.png',
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando assets estáticos');
      return cache.addAll(STATIC_ASSETS);
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

  // Cache-first para assets estáticos
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
