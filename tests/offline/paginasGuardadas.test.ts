import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { alinearConLaCuenta, cerrarSesionEnEsteDispositivo } from "../../lib/offline/paginasGuardadas";
import { CacheStorageFalsa } from "./cacheStorageFalsa";

/**
 * Las páginas que el service worker guardó para una cuenta no las ve otra.
 *
 * Dos caminos, los dos del navegador:
 *
 * - `alinearConLaCuenta` corre en cada carga, con la huella de la cuenta que
 *   el servidor vio (o `null` si no vio ninguna). Cubre la sesión que caduca
 *   sin pulsar el botón —la siguiente carga con red llega sin sesión— y la que
 *   se abre encima de otra, que `/login` permite porque no redirige a quien ya
 *   tiene sesión.
 * - `cerrarSesionEnEsteDispositivo` es lo que hace el botón: borra ANTES de
 *   pedirle nada al servidor, porque sin red esa petición no llega y el borrado
 *   tiene que haber ocurrido igual.
 *
 * La caducidad sin red es del service worker y se prueba en
 * `service-worker.test.ts`, junto con que el nombre de la caché que borra esto
 * sea el que aquél escribe.
 */

const PAGINAS = "nn-pages-v2";
let caches: CacheStorageFalsa;
let almacen: Map<string, string>;

async function guardarUnaPagina() {
  const cache = await caches.open(PAGINAS);
  await cache.put("/lots", new Response("página de la sesión anterior"));
}

beforeEach(() => {
  caches = new CacheStorageFalsa();
  almacen = new Map();
  Object.assign(globalThis, {
    caches,
    localStorage: {
      getItem: (k: string) => almacen.get(k) ?? null,
      setItem: (k: string, v: string) => void almacen.set(k, v),
      removeItem: (k: string) => void almacen.delete(k),
    },
  });
});

afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("alinearConLaCuenta — en cada carga", () => {
  it("control: con la misma cuenta que la carga anterior, lo guardado se queda", async () => {
    await alinearConLaCuenta("cuenta-a");
    await guardarUnaPagina();

    await alinearConLaCuenta("cuenta-a");
    expect(await caches.urlsDe(PAGINAS)).toEqual(["/lots"]);
  });

  it("una carga sin sesión borra lo guardado", async () => {
    await alinearConLaCuenta("cuenta-a");
    await guardarUnaPagina();

    await alinearConLaCuenta(null);
    expect(await caches.has(PAGINAS)).toBe(false);
  });

  it("una carga con otra cuenta borra lo guardado", async () => {
    await alinearConLaCuenta("cuenta-a");
    await guardarUnaPagina();

    await alinearConLaCuenta("cuenta-b");
    expect(await caches.has(PAGINAS)).toBe(false);
  });

  it("tras una carga sin sesión, la siguiente con la cuenta de antes también borra", async () => {
    // Sin esto, A → (nadie) → A dejaría pasar lo que se guardó entre medias.
    await alinearConLaCuenta("cuenta-a");
    await alinearConLaCuenta(null);
    await guardarUnaPagina();

    await alinearConLaCuenta("cuenta-a");
    expect(await caches.has(PAGINAS)).toBe(false);
  });

  it("una carga sin sesión borra aunque no haya cuenta anterior apuntada", async () => {
    // Con una cuenta anterior, «sin sesión» y «otra cuenta» borran por la misma
    // comparación; éste es el caso que sólo cubre mirar si hay sesión.
    await guardarUnaPagina();

    await alinearConLaCuenta(null);
    expect(await caches.has(PAGINAS)).toBe(false);
  });

  it("sin cuenta anterior apuntada, borra: no sabe de quién es lo guardado", async () => {
    await guardarUnaPagina();

    await alinearConLaCuenta("cuenta-a");
    expect(await caches.has(PAGINAS)).toBe(false);
  });
});

describe("cerrarSesionEnEsteDispositivo — el botón", () => {
  it("borra lo guardado antes de llamar al servidor", async () => {
    await guardarUnaPagina();
    const orden: string[] = [];
    const borrar = caches.delete.bind(caches);
    caches.delete = async (nombre: string) => {
      orden.push(`borrar ${nombre}`);
      return borrar(nombre);
    };

    await cerrarSesionEnEsteDispositivo(async () => {
      orden.push(`servidor, con la caché ${(await caches.has(PAGINAS)) ? "PRESENTE" : "borrada"}`);
    });
    expect(orden).toEqual([`borrar ${PAGINAS}`, "servidor, con la caché borrada"]);
  });

  it("sin red, lo dice y lo guardado queda borrado igual", async () => {
    await guardarUnaPagina();

    const estado = await cerrarSesionEnEsteDispositivo(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(estado).toEqual({ sinRed: true });
    expect(await caches.has(PAGINAS)).toBe(false);
  });

  it("la redirección de Next, o cualquier otro error, no se disfraza de falta de red", async () => {
    // Next rechaza la promesa de una acción que redirige con un error propio,
    // que tiene que llegar a su RedirectBoundary.
    const redireccion = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/;307;" });
    await expect(
      cerrarSesionEnEsteDispositivo(async () => {
        throw redireccion;
      }),
    ).rejects.toBe(redireccion);
  });
});
