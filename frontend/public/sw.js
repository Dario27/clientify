// Service worker de Clientify. Reglas simples para no servir nunca datos viejos:
//  - /api/* no se toca: siempre va a la red.
//  - Páginas (navegación): primero la red, así cada despliegue se ve enseguida; si no hay conexión,
//    se muestra /offline.html.
//  - /offline.html y /icon-192.png (lo que necesita esa página): siempre desde la caché.
//  - /assets/*: archivos con hash en el nombre, que nunca cambian de contenido; primero la caché.
// Para invalidar todo, subir VERSION.
const VERSION = 'v1'
const CACHE = `clientify-${VERSION}`
const OFFLINE_URL = '/offline.html'
const PRECACHE = [OFFLINE_URL, '/icon-192.png'] // lo que necesita la página sin conexión; se sirve desde la caché
const MAX_ASSETS = 40

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function guardar(request, response) {
  const cache = await caches.open(CACHE)
  await cache.put(request, response)
  const keys = await cache.keys()
  const assets = keys.filter((k) => new URL(k.url).pathname.startsWith('/assets/'))
  await Promise.all(assets.slice(0, Math.max(0, assets.length - MAX_ASSETS)).map((k) => cache.delete(k)))
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
    return
  }

  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) event.waitUntil(guardar(request, response.clone()))
        return response
      })),
    )
  }
})
