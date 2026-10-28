/* Offline support. App files: served from cache, refreshed in the background.
   products.json: always fetched fresh when online, cached copy used when offline. */
var CACHE = 'me-price-finder-v1';
var APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './products.json',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(APP_FILES); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  var isData = url.pathname.endsWith('/products.json');
  var isPage = req.mode === 'navigate' && /\/(index\.html)?$/.test(url.pathname);
  if (req.mode === 'navigate' && !isPage) return;       // e.g. update.html: always straight from the network

  if (isData || isPage) {
    // Network first so price updates appear immediately; fall back to the saved copy offline.
    event.respondWith(
      fetch(req).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(isPage ? './index.html' : './products.json', copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(isPage ? './index.html' : './products.json');
      })
    );
    return;
  }

  // Stale-while-revalidate for the other app files.
  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
