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
// v2 desde el 2026-10-09: las páginas guardadas llevan su hora y no
// sobreviven a la sesión (ver más abajo y `lib/offline/paginasGuardadas.ts`,
// que borra esta misma caché al cerrar sesión). Cambiar el nombre hace que el
// `activate` borre la v1 en cada teléfono al actualizarse, que es como
// desaparecen las páginas que ya se habían guardado sin hora y sin dueño.
const PAGE_CACHE = "nn-pages-v2";
const OFFLINE_URL = "/offline.html";

// Sin red, una página guardada no se sirve pasado lo que dura una sesión
// (`DURACION_DE_SESION_S`, en `lib/auth/duracionDeSesion.ts`): quien la
// guardó ya no tendría sesión. Va escrito a mano porque este archivo no puede
// importar; `tests/offline/service-worker.test.ts` comprueba que coincidan.
const MAX_EDAD_DE_PAGINA_MS = 7 * 24 * 60 * 60 * 1000;
const CABECERA_GUARDADA = "x-nn-guardada";

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
const OPERATOR_ROUTE_PREFIXES = ["/apiaries", "/field-sessions", "/lots", "/plots"];

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
      cache.put(request, conHora(response.clone()));
    }
    return response;
  } catch {
    const cached = await paginaVigente(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    return offline || Response.error();
  }
}

/** La misma respuesta, con la hora a la que se guardó. El cuerpo pasa como flujo: no se espera a leerlo. */
function conHora(response) {
  const headers = new Headers(response.headers);
  headers.set(CABECERA_GUARDADA, String(Date.now()));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * La página guardada, si se guardó hace menos de lo que dura una sesión. Una
 * sin hora —de antes de la v2— o más vieja no se sirve, y se borra.
 */
async function paginaVigente(request) {
  const cache = await caches.open(PAGE_CACHE);
  const cached = await cache.match(request);
  if (!cached) return undefined;
  // `Number(null)` es 0 y `Number("x")` es NaN: los dos dan una edad que no
  // pasa la comparación, así que una hora ausente o rota no se sirve.
  const edad = Date.now() - Number(cached.headers.get(CABECERA_GUARDADA));
  if (edad <= MAX_EDAD_DE_PAGINA_MS) return cached;
  await cache.delete(request);
  return undefined;
}
