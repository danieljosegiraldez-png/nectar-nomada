import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { DURACION_DE_SESION_S } from "../../lib/auth/duracionDeSesion";
import { borrarPaginasGuardadas } from "../../lib/offline/paginasGuardadas";
import { CacheStorageFalsa } from "./cacheStorageFalsa";

/**
 * Lo que el service worker guarda de una sesión no le sobrevive.
 *
 * **El defecto que lo motiva, visto el 2026-10-09.** `public/sw.js` guardaba en
 * `nn-pages-v1` cada navegación a una ruta de operario —lotes, parcelas,
 * apiarios, jornadas— y nada la borraba al cerrar sesión. En un teléfono
 * compartido y sin red, quien entraba después abría esas URL y veía la última
 * versión de la sesión anterior.
 *
 * Esto ejecuta el `public/sw.js` real en un contexto `vm`, con una CacheStorage
 * en memoria y una red que se enciende y se apaga. No lee su texto: le manda
 * eventos `install`, `activate` y `fetch` y mira qué contesta.
 *
 * **Su límite, dicho:** el `Request` de una navegación no se puede construir en
 * Node (`mode: "navigate"` está prohibido en el constructor), así que la
 * petición es un objeto con los cuatro campos que `sw.js` lee. Si `sw.js`
 * empezara a leer otro campo de la petición, este arnés no lo tendría.
 */

const ORIGEN = "https://nn.test";
const DIA_MS = 24 * 60 * 60 * 1000;
const SESION_MS = DURACION_DE_SESION_S * 1000;
const FUENTE = readFileSync(join(new URL("../..", import.meta.url).pathname, "public/sw.js"), "utf8");

interface Arnes {
  caches: CacheStorageFalsa;
  red: { encendida: boolean };
  reloj: { ahora: number };
  navegar(ruta: string): Promise<string>;
  emitir(tipo: "install" | "activate"): Promise<void>;
}

const instalados: CacheStorageFalsa[] = [];

async function arrancar(): Promise<Arnes> {
  const red = { encendida: true };
  const fetchFalso = async (peticion: string | { url: string }) => {
    if (!red.encendida) throw new TypeError("Failed to fetch");
    const url = new URL(typeof peticion === "string" ? peticion : peticion.url, ORIGEN);
    return new Response(`página ${url.pathname}`, { status: 200, headers: { "content-type": "text/html" } });
  };
  const caches = new CacheStorageFalsa(ORIGEN, fetchFalso);
  instalados.push(caches);
  const reloj = { ahora: Date.UTC(2026, 9, 9, 12) };
  const oyentes = new Map<string, (evento: unknown) => void>();

  const RelojDate = class extends Date {};
  (RelojDate as unknown as { now: () => number }).now = () => reloj.ahora;

  const contexto = createContext({
    self: {
      location: { origin: ORIGEN },
      addEventListener: (tipo: string, fn: (evento: unknown) => void) => oyentes.set(tipo, fn),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches,
    fetch: fetchFalso,
    Response,
    Headers,
    URL,
    Date: RelojDate,
  });
  runInContext(FUENTE, contexto);

  async function emitir(tipo: "install" | "activate") {
    const esperas: Promise<unknown>[] = [];
    oyentes.get(tipo)!({ waitUntil: (p: Promise<unknown>) => esperas.push(p) });
    await Promise.all(esperas);
  }

  async function navegar(ruta: string): Promise<string> {
    let respuesta: Promise<Response> | undefined;
    oyentes.get("fetch")!({
      request: { method: "GET", url: ORIGEN + ruta, mode: "navigate" },
      respondWith: (p: Promise<Response>) => (respuesta = p),
    });
    if (!respuesta) throw new Error(`el service worker no interceptó ${ruta}`);
    const texto = await (await respuesta).text();
    await caches.esperar();
    return texto;
  }

  await emitir("install");
  await emitir("activate");
  return { caches, red, reloj, navegar, emitir };
}

afterEach(() => {
  instalados.length = 0;
  delete (globalThis as { caches?: unknown }).caches;
});

describe("public/sw.js — páginas de operario guardadas", () => {
  it("control: con red sirve la página del servidor, y sin red la guardada", async () => {
    const sw = await arrancar();
    expect(await sw.navegar("/lots")).toBe("página /lots");

    sw.red.encendida = false;
    expect(await sw.navegar("/lots")).toBe("página /lots");
    // …y una ruta nunca visitada cae a offline.html, que se precarga al instalar.
    expect(await sw.navegar("/plots")).toBe("página /offline.html");
  });

  it("sin red, sirve la página guardada mientras no haya pasado lo que dura una sesión", async () => {
    const sw = await arrancar();
    await sw.navegar("/lots");

    sw.red.encendida = false;
    sw.reloj.ahora += SESION_MS - 1000;
    expect(await sw.navegar("/lots")).toBe("página /lots");
  });

  it("sin red, una página guardada hace más de lo que dura una sesión no se sirve y se borra", async () => {
    const sw = await arrancar();
    await sw.navegar("/lots");

    sw.red.encendida = false;
    sw.reloj.ahora += SESION_MS + 1;
    expect(await sw.navegar("/lots")).toBe("página /offline.html");
    expect(await sw.caches.urlsDe("nn-pages-v2")).toEqual([]);
  });

  it("una página guardada sin hora —por un service worker anterior— no se sirve", async () => {
    const sw = await arrancar();
    const cache = await sw.caches.open("nn-pages-v2");
    await cache.put(ORIGEN + "/lots", new Response("página de la sesión anterior"));

    sw.red.encendida = false;
    expect(await sw.navegar("/lots")).toBe("página /offline.html");
  });

  it("al activarse, borra la caché de páginas de la versión anterior y conserva el armazón", async () => {
    const sw = await arrancar();
    const vieja = await sw.caches.open("nn-pages-v1");
    await vieja.put(ORIGEN + "/lots", new Response("página de la sesión anterior"));

    await sw.emitir("activate");
    expect(await sw.caches.has("nn-pages-v1")).toBe(false);
    expect(await sw.caches.has("nn-shell-v1")).toBe(true);
  });

  it("borrarPaginasGuardadas —lo que llama el botón— borra lo que guardó el service worker", async () => {
    const sw = await arrancar();
    await sw.navegar("/lots");
    sw.reloj.ahora += DIA_MS;

    (globalThis as { caches?: unknown }).caches = sw.caches;
    await borrarPaginasGuardadas();

    sw.red.encendida = false;
    expect(await sw.navegar("/lots")).toBe("página /offline.html");
  });
});
