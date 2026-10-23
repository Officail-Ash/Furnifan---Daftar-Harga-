const CACHE_NAME = "furnifan-daftar-harga-v1";
const SHELL = ["./", "./index.html", "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin && event.request.method==="GET"){
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
  }
});
