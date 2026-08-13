/**
 * A5.5 (docs/implementation/28_A5.5_SERVICE_WORKER_OFFLINE.md). Narrow,
 * deliberately: caches the app shell so tapping the icon opens the
 * interface without a signal — nothing more. No Background Sync, no
 * conflict resolution, no map-tile caching, no push. A5's IndexedDB draft
 * queue (lib/apiary/offlineQueue.ts) still does all the actual data work;
 * this only makes the *page* reachable offline.
 *
 * Two cache stores:
 * - SHELL_CACHE: build assets (/_next/static/*, fonts, icons, manifest),
 *   cache-first — content-hashed and effectively immutable.
 * - PAGE_CACHE: navigation responses for the operator routes, network-first
 *   with a cache fallback, populated as pages are actually visited (not a
 *   synthetic precache of every possible dynamic URL — that isn't
 *   knowable in advance for /apiaries/[id]/hives/[hiveId]).
 *
 * OFFLINE_URL is precached at install so a never-before-visited URL still
 * opens to *something* instead of the browser's own offline error page.
 */
const SHELL_CACHE = "nn-shell-v1";
const PAGE_CACHE = "nn-pages-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

// Operator routes this ticket covers (§1) — apiary (A5) and the coffee
// equivalent (T10/T13). Deliberately excludes admin/report routes (§1's
// own "no construir" list).
const OPERATOR_ROUTE_PREFIXES = ["/apiaries", "/lots"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isOperatorRoute(url) {
  return OPERATOR_ROUTE_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix + "/"));
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.startsWith("/__nextjs_font/")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // never intercept writes — server actions/mutations always go straight to the network
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate" && isOperatorRoute(url)) {
    event.respondWith(networkFirstNavigation(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request, { cacheName: SHELL_CACHE });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGE_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request, { cacheName: PAGE_CACHE });
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    return offline || Response.error();
  }
}
