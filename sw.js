// sw.js - Service worker de webapp-rutas.
// Estrategias:
//  - App (recursos locales): cache-first con actualizacion en segundo plano.
//  - Navegacion: network-first con fallback a cache (para recibir updates).
//  - Tiles (OSM / Esri): cache-first con limite de entradas (funciona offline
//    en zonas ya visitadas).
//  - OpenTopoData (alturas): solo red, no se cachea.

const VERSION = 'v1.3';
const CACHE_APP = `rutas-app-${VERSION}`;
const CACHE_TILES = 'rutas-tiles';
const MAX_TILES = 2000;

const ASSETS_APP = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/marker-icon.png',
  './vendor/leaflet/marker-icon-2x.png',
  './vendor/leaflet/marker-shadow.png',
  './js/app.js',
  './js/geo.js',
  './js/graba.js',
  './js/altura.js',
  './js/almacen.js',
  './js/mapa.js',
  './js/perfil.js',
  './js/exportar.js',
  './js/ui.js',
  './js/util.js',
  './iconos/icon-192.png',
  './iconos/icon-512.png',
  './iconos/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_APP).then((cache) => cache.addAll(ASSETS_APP)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('rutas-app-') && k !== CACHE_APP)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function esTile(url) {
  return /tile\.openstreetmap\.org/.test(url) || /server\.arcgisonline\.com/.test(url);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Alturas SRTM: solo red (dato dinamico, no se cachea).
  if (url.hostname === 'api.opentopodata.org') return;

  // Tiles: cache-first con limite.
  if (esTile(req.url)) {
    event.respondWith(
      caches.open(CACHE_TILES).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) {
            const entradas = await cache.keys();
            if (entradas.length >= MAX_TILES) {
              await cache.delete(entradas[0]);
            }
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          return hit || new Response('', { status: 504 });
        }
      }),
    );
    return;
  }

  // Navegacion (documentos): network-first con fallback a cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE_APP).then((c) => c.put('./index.html', copia));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Assets locales: cache-first con actualizacion en segundo plano.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const refresco = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copia = res.clone();
              caches.open(CACHE_APP).then((c) => c.put(req, copia));
            }
            return res;
          })
          .catch(() => hit);
        return hit || refresco;
      }),
    );
  }
});