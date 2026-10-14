/* =========================================================================
 *  Service worker de Hábitos en Familia
 *
 *  Para qué: que la app abra al momento y que se pueda apuntar sin
 *  cobertura (en el campo, en el coche). Los datos ya viven en el aparato y
 *  se suben solos a la nube al volver la red; lo que faltaba era la propia
 *  app, que sin red no llegaba a cargar.
 *
 *  - La página: primero la red, para estrenar siempre lo último publicado;
 *    si no contesta en unos segundos, la guardada.
 *  - El código de `/_next/static`: lleva la huella en el nombre y no cambia
 *    nunca, así que se sirve de lo guardado sin preguntar.
 *  - Fotos e iconos: lo guardado al instante, y se refresca por detrás.
 *  - Lo demás (la API, Supabase, los PDF, el audio) pasa de largo.
 * ========================================================================= */

const VERSION = 'v1';
const PAGES = `paginas-${VERSION}`;
const STATIC = `codigo-${VERSION}`;
const MEDIA = `fotos-${VERSION}`;
const KEEP = [PAGES, STATIC, MEDIA];
const NETWORK_WAIT_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.add('/'))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Que lo guardado no crezca sin fin con cada versión publicada. */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put('/', response.clone());
    return response;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT_MS, null));
  try {
    const fast = await Promise.race([network, timeout]);
    if (fast) return fast;
  } catch {
    /* sin red: a lo guardado */
  }
  const cached = await cache.match('/');
  if (cached) return cached;
  return network;
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trim(STATIC, 250);
  }
  return response;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(MEDIA);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
        trim(MEDIA, 120);
      }
      return response;
    })
    .catch(() => cached);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/documentos/') || url.pathname.startsWith('/audio/')) return;

  // Sólo la portada es una página: el resto de rutas son de la API o de
  // volver de Google, y ésas siempre a la red.
  if (request.mode === 'navigate') {
    if (url.pathname === '/') event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (
    url.pathname.startsWith('/_next/image') ||
    url.pathname.startsWith('/photos/') ||
    /^\/(icon|apple-touch-icon)[^/]*\.(png|svg)$/.test(url.pathname) ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
