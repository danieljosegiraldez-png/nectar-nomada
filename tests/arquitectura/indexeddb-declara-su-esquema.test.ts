import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Todo archivo que abre una base de IndexedDB dice qué hace si la base no existe.
 *
 * **Por qué existe.** El 2026-10-12, verificando la cola offline del apiario en un
 * build de producción, todo guardado sin señal fallaba con `NotFoundError` y la
 * pantalla decía «No se pudo guardar en este dispositivo». La causa era
 * `public/offline.html`: para contar borradores abría `nectar-apiary-offline` en
 * la versión 1 **sin manejador de subida**, y en un aparato sin esa base eso la
 * CREA vacía. Después la cola abría la misma versión, su manejador —el único sitio
 * que crea el almacén `drafts`— ya no corría porque la versión 1 existía, y el
 * teléfono quedaba sin poder guardar hasta que alguien borrara la base a mano.
 *
 * Un `indexedDB.open` sin manejador de subida no falla: crea. Por eso cualquier
 * lector nuevo de cualquiera de las tres bases —apiario, campo, fotos de trampa—
 * puede repetirlo sin que nada se ponga rojo.
 *
 * **Lo que este guardia NO puede ver, dicho para que nadie lo cuente dos veces.**
 * Comprueba que el manejador EXISTA, no que haga lo correcto: uno vacío lo
 * satisface. Y cuenta por archivo, no por llamada: dos aperturas con un solo
 * manejador pasan. La conducta —que `offline.html` no cree la base, que la cola se
 * cure de una base sin almacén— la mide un Chrome de verdad en
 * `tools/browser-checks/indexeddb-sin-almacen.mjs`, que no corre en CI.
 *
 * Hermético: sólo lee archivos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const CARPETAS = ["app", "lib", "public"];

const archivos = (dir: string): string[] => {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else if (/\.(tsx?|m?js|html)$/.test(entrada)) salida.push(ruta);
  }
  return salida;
};

/** Una llamada que abre una base: `indexedDB.open(`, con o sin `window.` delante. */
export const abreUnaBase = (fuente: string) => /\bindexedDB\s*\.\s*open\s*\(/.test(fuente);

/**
 * Un manejador de subida ASIGNADO o REGISTRADO — no una mención. La prosa que
 * explica por qué hace falta («sin onupgradeneeded…») no cuenta: si contara, el
 * comentario que describe el defecto bastaría para tapar el defecto.
 */
export const declaraLaSubida = (fuente: string) =>
  /\.\s*onupgradeneeded\s*=(?!=)/.test(fuente) || /addEventListener\s*\(\s*["'`]upgradeneeded["'`]/.test(fuente);

const aperturas = CARPETAS.flatMap((c) => archivos(join(RAIZ, c)))
  .map((ruta) => ({ ruta: relative(RAIZ, ruta), fuente: readFileSync(ruta, "utf8") }))
  .filter(({ fuente }) => abreUnaBase(fuente));

describe("toda apertura de IndexedDB declara qué hace si la base no existe", () => {
  /**
   * Control positivo: si el patrón dejara de casar —o `public/` dejara de
   * recorrerse— la lista saldría vacía y «ninguno incumple» se leería igual que
   * «no miré». Los cuatro de hoy, por nombre.
   */
  it("encuentra las cuatro aperturas que hay hoy", () => {
    expect(aperturas.map((a) => a.ruta).sort()).toEqual(
      expect.arrayContaining([
        "lib/apiary/offlineQueue.ts",
        "lib/sync/offlineQueue.ts",
        "lib/sync/trapPhotoQueue.ts",
        "public/offline.html",
      ]),
    );
  });

  it.each(aperturas.map((a) => [a.ruta, a.fuente] as const))("%s declara su manejador de subida", (_ruta, fuente) => {
    expect(declaraLaSubida(fuente)).toBe(true);
  });

  /** Entradas hostiles: el árbol de hoy no contiene ninguna de estas formas. */
  describe("el detector", () => {
    it("ve una apertura sin manejador como incumplimiento", () => {
      const fuente = `var req = indexedDB.open("nectar-apiary-offline", 1); req.onsuccess = function () {};`;
      expect(abreUnaBase(fuente)).toBe(true);
      expect(declaraLaSubida(fuente)).toBe(false);
    });

    it("no se deja convencer por la prosa que nombra el manejador", () => {
      expect(declaraLaSubida(`// abría la base sin onupgradeneeded, y eso la creaba vacía`)).toBe(false);
      expect(declaraLaSubida(`if (req.onupgradeneeded == null) {}`)).toBe(false);
    });

    it("acepta la asignación y el registro por evento", () => {
      expect(declaraLaSubida(`request.onupgradeneeded = () => {}`)).toBe(true);
      expect(declaraLaSubida(`req.addEventListener("upgradeneeded", f)`)).toBe(true);
    });

    it("ve la apertura con `window.` delante", () => {
      expect(abreUnaBase(`window.indexedDB.open("x")`)).toBe(true);
      expect(abreUnaBase(`indexedDB.deleteDatabase("x")`)).toBe(false);
    });
  });
});
