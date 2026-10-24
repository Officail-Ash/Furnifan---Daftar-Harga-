"use strict";

const CACHE_NAME = "furnifan-daftar-harga-pwa-v3";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

/* MEMASANG SERVICE WORKER BARU */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

/* MENGHAPUS CACHE VERSI LAMA */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) =>
              name.startsWith("furnifan-daftar-harga-pwa-") &&
              name !== CACHE_NAME
            )
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

/* MEMUAT FILE DARI INTERNET, DENGAN CADANGAN CACHE */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Hanya menangani file dari repositori PWA ini.
  // URL Google Apps Script tidak di-cache oleh service worker ini.
  if (url.origin !== self.location.origin) return;

  // Permintaan halaman: coba jaringan terlebih dahulu.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, copy))
              .catch((error) => {
                console.warn("Cache halaman gagal:", error);
              });
          }

          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);

          if (cached) return cached;

          const fallback = await caches.match("./index.html");

          if (fallback) return fallback;

          return new Response(
            "Koneksi internet tidak tersedia. Silakan coba kembali.",
            {
              status: 503,
              headers: {
                "Content-Type": "text/plain; charset=utf-8"
              }
            }
          );
        })
    );

    return;
  }

  // File pendukung: gunakan cache jika tersedia,
  // sambil memperbarui cache dari jaringan.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkRequest = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, copy))
              .catch((error) => {
                console.warn("Pembaruan cache gagal:", error);
              });
          }

          return response;
        });

      return cached || networkRequest;
    })
  );
});
