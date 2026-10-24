const CACHE_NAME = "furnifan-daftar-harga-pwa-v2";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Instalasi service worker dan penyimpanan file pembungkus.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// Hapus cache versi lama milik Daftar Harga saja.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) =>
            key.startsWith("furnifan-daftar-harga-pwa-") &&
            key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Jaringan sebagai sumber utama; cache sebagai cadangan.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Jangan mengganggu POST atau permintaan lintas domain,
  // termasuk permintaan ke Google Apps Script.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch((error) => {
              console.warn("Penyimpanan cache gagal:", error);
            });
        }

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);

        if (cached) {
          return cached;
        }

        if (request.mode === "navigate") {
          const shell = await caches.match("./index.html");

          if (shell) {
            return shell;
          }
        }

        return Response.error();
      })
  );
});
