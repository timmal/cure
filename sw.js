/* Service worker: прекеш всех файлов, stale-while-revalidate для своих ресурсов. */
const VERSION = 'cure-v1';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './data.js',
  './store.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './fonts/ibm-plex-sans-cyrillic-400-normal.woff2',
  './fonts/ibm-plex-sans-cyrillic-500-normal.woff2',
  './fonts/ibm-plex-sans-cyrillic-600-normal.woff2',
  './fonts/ibm-plex-sans-latin-400-normal.woff2',
  './fonts/ibm-plex-sans-latin-500-normal.woff2',
  './fonts/ibm-plex-sans-latin-600-normal.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Навигация всегда отдаёт оболочку приложения.
  const key = req.mode === 'navigate' ? './index.html' : req;

  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(key);
      const network = fetch(req).then(res => {
        if (res && res.ok) cache.put(key, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { e.waitUntil(network); return cached; }
      const res = await network;
      return res || new Response('Офлайн', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })
  );
});
