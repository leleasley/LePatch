const CACHE_VERSION = 3;
const CACHE_NAME = `lepatch-v${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  "/manifest.json",
  "/assets/Logo.png",
  "/assets/dark_desktop_background.png",
  "/assets/dark_mobile_background.png",
  "/assets/light_desktop_background.png",
  "/assets/light_mobile_background.png",
  "/assets/splash-dark.svg",
  "/assets/splash-light.svg",
  "/assets/splash-dark-mobile.svg",
  "/assets/splash-light-mobile.svg",
  "/favicon.ico",
  "/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // API calls: network only, offline fallback
  if (request.url.includes("/api/")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "Offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // Next.js build chunks: network first, never cache
  // These use content-hashed filenames so cached versions become stale after deploys
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Other CSS/JS: stale-while-revalidate (safe for non-hashed assets)
  if (/\.(css|js)$/i.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || new Response("", { status: 408 }))
        )
    );
    return;
  }

  // Images: cache first, network fallback, background update
  if (/\.(png|jpg|jpeg|gif|svg|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }
});
