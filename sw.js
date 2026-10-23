const CACHE_NAME = "furnifan-daftar-harga-v1";
const SHELL = ["./", "./index.html", "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png"];
// Instalasi service worker dan cache file utama
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin && event.request.method==="GET"){
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
  }
});
// Instalasi service worker dan cache file utama
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// Aktivasi dan penghapusan cache versi lama
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Menangani permintaan file dari aplikasi
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Hanya menangani GET dari domain aplikasi sendiri
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Jangan mengganggu permintaan navigasi ke halaman lain
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).catch(() => {
        // Jika halaman utama gagal dimuat, gunakan halaman cache
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }

        // File lain yang tidak tersedia akan tetap menghasilkan error jaringan
        throw new Error('File tidak tersedia saat offline');
      });
    })
  );
});
