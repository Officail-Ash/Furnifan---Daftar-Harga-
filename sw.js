const CACHE_NAME = 'furnifan-catatan-shell-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

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
