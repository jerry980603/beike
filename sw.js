/* 離線快取：先用網路、沒網路用快取（同單字 App 的做法） */
var CACHE = "beike-v1";
var FILES = ["./", "./index.html", "./core.js", "./app.js", "./cards.js", "./manifest.json", "./icon.svg"];
self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () { }); }));
  }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k.indexOf("beike-") === 0 && k !== CACHE ? caches.delete(k) : null; }));
  }).then(function () { return self.clients.claim(); }));
});
/* no-cache：每次跟伺服器確認（沒變就 304），新卡片才不會晚十分鐘出現 */
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || e.request.url.indexOf(self.location.origin) !== 0) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match("./index.html"); });
    })
  );
});
