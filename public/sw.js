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
// A9.5 — toda ruta desde la que se captura en campo. La lista NO se mantiene a
// ojo: `tests/arquitectura/rutas-de-operador.test.ts` la deriva de qué páginas
// renderizan un formulario y falla si alguna queda fuera.
//
// `/field-sessions` entró con la visita de apiario: sin él, la pantalla que
// agrupa el trabajo del día no abre sin señal, que es justo cuando se usa.
// `/plots` llevaba fuera desde antes y es del café: esa página tiene OCHO
// formularios de captura, y `/lots` —que sí estaba— es otra cosa.
//
// `/beneficio` entró con R2 del plan farm-to-green (ADR-197, 2026-10-09) y no por capturar: el
// jefe de beneficio la LEE en el patio, sin red. Va declarada aparte en la misma prueba. Sus
// formularios siguen necesitando red: esto sólo hace la página alcanzable.
const OPERATOR_ROUTE_PREFIXES = ["/apiaries", "/beneficio", "/field-sessions", "/lots", "/plots"];

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
    if (cached) return servirComoGuardada(cached);
    const offline = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    return offline || Response.error();
  }
}

/**
 * Una página guardada se sirve MARCADA — R2 del plan farm-to-green (ADR-197), 2026-10-09. Hasta
 * entonces se enseñaba sin red como si fuera la actual. La hora sale de la cabecera `date` que el
 * servidor puso al responder, que es cuándo se generó lo que se ve; sin ella, la marca va vacía y
 * el aviso dice «una versión guardada» sin inventar cuándo.
 *
 * `content-length` y `content-encoding` se quitan: el cuerpo cambia de largo y ya viene
 * descomprimido.
 */
async function servirComoGuardada(cached) {
  const fecha = new Date(cached.headers.get("date") || "");
  const guardadaEl = Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
  const html = marcarComoGuardada(await cached.text(), guardadaEl);
  const headers = new Headers(cached.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(html, { status: cached.status, statusText: cached.statusText, headers });
}

/**
 * Pone `<meta name="nn-guardada-el" content="<ISO>">` justo después del primer `<head>`. Sólo una
 * fecha ISO llega al HTML; cualquier otra cosa se escribe vacía. Lo prueba
 * `tests/sync/versionGuardada.test.ts`. El reemplazo es una FUNCIÓN y no una cadena: si algún día el
 * valor admitiera un `$`, en una cadena se leería como `$&` o `$1`. Hoy la validación ya lo impide, así
 * que es una segunda red y ninguna prueba la distingue (medido: cambiarla por una cadena no tumba nada).
 */
function marcarComoGuardada(html, guardadaEl) {
  const valor =
    typeof guardadaEl === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(guardadaEl) ? guardadaEl : "";
  return html.replace(/<head(\s[^>]*)?>/i, (cabecera) => `${cabecera}<meta name="nn-guardada-el" content="${valor}">`);
}
