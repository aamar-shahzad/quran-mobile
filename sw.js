const CACHE_NAME = "quran-mobile-v7";

function isAppShellRequest(url) {
  try {
    const path = new URL(url).pathname;
    return (
      path.includes("/quran-mobile") &&
      (path.endsWith("/quran-mobile/") ||
        path.endsWith("/quran-mobile") ||
        path.endsWith("/index.html") ||
        path.includes("manifest.webmanifest") ||
        path.includes("/icons/") ||
        path.endsWith("/sw.js"))
    );
  } catch {
    return false;
  }
}

function isQuranApiRequest(url) {
  return url.includes("api.alquran.cloud");
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = event.request.url;

  if (event.request.mode === "navigate" || isAppShellRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && isAppShellRequest(url)) {
            const clone = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  if (isQuranApiRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((networkRes) => {
          if (networkRes.ok) {
            const clone = networkRes.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, clone));
          }
          return networkRes;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }
});
