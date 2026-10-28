/*
 * Grind's service worker. It does two small things:
 *   1. Keeps the build's static files (scripts, styles, fonts, icons) on the device so the app opens fast.
 *   2. Shows a friendly offline page when a page can't be loaded because there is no connection.
 *
 * It never stores pages, API responses or anything else from the signed-in app: those hold a person's private
 * training data and must always come from the server. Bump VERSION to drop everything this worker cached.
 */
const VERSION = "grind-v2";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/pwa-icon/192"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // The app was called Kilo before Grind: caches from either name, other than the current one, are obsolete
      .then((keys) => Promise.all(keys.filter((key) => /^(kilo|grind)-/.test(key) && key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Files under /_next/static/ have the content hash in their name, so a cached copy is never stale. */
async function cacheFirst(request, event) {
  // Storage may be unavailable or full; caching must never prevent a network response.
  const cache = await caches.open(STATIC_CACHE).catch(() => null);
  const cached = await cache?.match(request).catch(() => undefined);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && cache) event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/")) {
    event.respondWith(cacheFirst(request, event));
    return;
  }

  // Opening a page: always ask the server; only if the network is down, show the offline page
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const offline = await caches.match(OFFLINE_URL).catch(() => undefined);
      return offline || new Response("You're offline. Check your connection and try again.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }));
  }
  // Everything else (API calls, sign-in, the plan itself) is left alone and goes straight to the network
});
