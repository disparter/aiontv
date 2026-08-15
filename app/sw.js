/* JarvisTV companion SW — shell offline leve; API sempre na rede. */
var CACHE = 'jarvistv-shell-v0.6.40';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/reset.css',
  './css/tv-layout.css',
  './css/focus.css',
  './css/companion.css',
  './js/config.js',
  './js/companion.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(SHELL.map(function (u) {
        return new Request(u, { cache: 'reload' });
      })).catch(function () { /* partial ok */ });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // API / WS / media — sempre rede
  if (url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/ws/') === 0
      || url.pathname.indexOf('/media/') === 0 || url.pathname.indexOf('/roms/') === 0) {
    return;
  }
  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && url.origin === self.location.origin) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
