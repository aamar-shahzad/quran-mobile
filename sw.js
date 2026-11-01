const CACHE_NAME = "quran-mobile-v18";
const ASSETS_CACHE = "quran-mobile-assets-v1";
const API_CACHE = "quran-mobile-api-v1";
const AUDIO_CACHE = "quran-mobile-audio-v1";
const API_CACHE_MAX = 500;
const AUDIO_CACHE_MAX = 40;
const NETWORK_TIMEOUT_MS = 4000;

function scopeBasePath() {
  try {
    const path = new URL(self.location.href).pathname;
    const dir = path.replace(/\/[^/]*$/, "/");
    return dir.endsWith("/") ? dir : `${dir}/`;
  } catch {
    return "/";
  }
}

function isAppShellRequest(url) {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const base = scopeBasePath();
    if (
      path.endsWith("/sw.js") ||
      path.includes("manifest.webmanifest") ||
      path.includes("/icons/")
    ) {
      return true;
    }
    if (base !== "/" && path.startsWith(base)) {
      return (
        path === base ||
        path.endsWith("/index.html") ||
        path.endsWith(base.slice(0, -1))
      );
    }
    return path.endsWith("/index.html") || path === "/" || path.endsWith("/");
  } catch {
    return false;
  }
}

function isRuntimeAsset(url) {
  return (
    url.includes("cdn.tailwindcss.com") ||
    url.includes("unpkg.com/@phosphor-icons") ||
    url.includes("fonts.googleapis.com") ||
    url.includes("fonts.gstatic.com")
  );
}

function isQuranApiRequest(url) {
  return url.includes("api.alquran.cloud") || url.includes("api.quran.com");
}

function isAyahAudioRequest(url) {
  return url.includes("cdn.islamic.network/quran/audio/");
}

function isAyahAudioLookup(url) {
  return /api\.alquran\.cloud\/v1\/ayah\/\d+\//.test(url);
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i += 1) {
    await cache.delete(keys[i]);
  }
}

function fetchWithTimeout(request, ms) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]);
}

async function cachePut(request, response, cacheName) {
  if (!response || !response.ok) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  if (cacheName === API_CACHE) await trimCache(API_CACHE, API_CACHE_MAX);
  if (cacheName === AUDIO_CACHE) await trimCache(AUDIO_CACHE, AUDIO_CACHE_MAX);
}

async function networkFirstApi(request) {
  try {
    const networkRes = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (networkRes.ok && !isAyahAudioLookup(request.url)) {
      await cachePut(request, networkRes, API_CACHE);
    }
    return networkRes;
  } catch {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

async function staleWhileRevalidateAsset(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request)
    .then((res) => {
      if (res.ok) cachePut(request, res, ASSETS_CACHE);
      return res;
    })
    .catch(() => null);
  if (cached) {
    fetchPromise.catch(() => {});
    return cached;
  }
  const networkRes = await fetchPromise;
  return networkRes || Response.error();
}

async function cacheFirstAudio(request) {
  if (request.headers.get("range")) {
    return fetch(request);
  }
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok && res.status === 200) await cachePut(request, res, AUDIO_CACHE);
    return res;
  } catch {
    return Response.error();
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", () => {
  // Wait for user to tap Update (SKIP_WAITING message).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== CACHE_NAME &&
                key !== ASSETS_CACHE &&
                key !== API_CACHE &&
                key !== AUDIO_CACHE,
            )
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
      (async () => {
        try {
          const response = await fetch(event.request);
          if (response.ok && isAppShellRequest(url)) {
            event.waitUntil(cachePut(event.request, response, CACHE_NAME));
          }
          return response;
        } catch {
          const cached =
            (await caches.match(event.request, { ignoreSearch: true })) ||
            (await caches.match(scopeBasePath() + "index.html")) ||
            (await caches.match("index.html"));
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  if (isRuntimeAsset(url)) {
    event.respondWith(staleWhileRevalidateAsset(event.request));
    return;
  }

  if (isAyahAudioRequest(url)) {
    event.respondWith(cacheFirstAudio(event.request));
    return;
  }

  if (isQuranApiRequest(url)) {
    event.respondWith(networkFirstApi(event.request));
  }
});
