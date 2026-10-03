/* AccentCoach Service Worker：缓存应用外壳，离线可打开界面。
 * AI 请求（跨域）不缓存，始终直连。 */
(function () {
  'use strict';

  var CACHE = 'accentcoach-v7';
  var ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/diff.js',
    './js/passages.js',
    './js/speech.js',
    './js/asr.js',
    './js/voice.js',
    './js/ai.js',
    './js/practice.js',
    './js/chat.js',
    './js/app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
  ];

  self.addEventListener('install', function (e) {
    e.waitUntil(
      caches.open(CACHE)
        .then(function (c) { return c.addAll(ASSETS); })
        .then(function () { return self.skipWaiting(); })
    );
  });

  self.addEventListener('activate', function (e) {
    e.waitUntil(
      caches.keys()
        .then(function (keys) {
          return Promise.all(keys.filter(function (k) { return k !== CACHE; })
            .map(function (k) { return caches.delete(k); }));
        })
        .then(function () { return self.clients.claim(); })
    );
  });

  self.addEventListener('fetch', function (e) {
    if (e.request.method !== 'GET') return;
    var url = new URL(e.request.url);
    if (url.origin !== location.origin) return; // AI 接口直连，不缓存

    e.respondWith(
      caches.match(e.request).then(function (hit) {
        if (hit) {
          // 后台静默更新
          fetch(e.request).then(function (res) {
            if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(e.request, res); });
          }).catch(function () { });
          return hit;
        }
        return fetch(e.request).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
          return res;
        }).catch(function () {
          // 离线且未缓存时回退到首页
          return caches.match('./index.html');
        });
      })
    );
  });
})();
