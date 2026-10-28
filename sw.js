/* Service worker SIRAPAT – cache aplikasi agar bisa dibuka offline */
var VERSION = 'sirapat-v13';
var SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/config.js', 'js/cover.js', 'js/laporan.js', 'js/ttd.js', 'js/app.js',
  'assets/logo.png', 'assets/logo-kemenkes.png', 'assets/ic-pin.png', 'assets/ic-phone.png', 'assets/ic-web.png',
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // panggilan API (POST) selalu ke jaringan
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;             // Google, QR, font: biarkan browser
  // network-first untuk file aplikasi (agar pembaruan cepat terlihat), fallback ke cache saat offline
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (r) { return r || caches.match('index.html'); });
  }));
});
