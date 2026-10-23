/* Service worker: hace que la app abra sin internet.
 *
 * Guarda en caché solo los archivos de la app (mismo origen). Las
 * respuestas de Supabase NO se guardan nunca: llevan precios de compra,
 * ventas y gastos, y no deben quedar escritas en el navegador. Lo que
 * se puede consultar sin señal es la copia que la propia app guarda al
 * cargar, y que se borra al cerrar sesión.
 */
const CACHE = 'cuentas-claras-v6';

const ARCHIVOS = [
  './',
  './index.html',
  './tokens.css',
  './styles.css',
  './app.js',
  './datos.js',
  './supabase-config.js',
  './vendor/supabase.js',
  './catalogo.html',
  './catalogo.css',
  './catalogo.js',
  './fonts/fraunces.woff2',
  './fonts/manrope.woff2',
  './manifest.webmanifest',
  './icons/logos.webp',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Todo lo que no sea un archivo de la app (Supabase, por ejemplo) pasa
  // directo a la red, sin tocar la caché.
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Las respuestas parciales o de error no sirven como copia offline.
        if (res && res.ok && res.type === 'basic') {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
