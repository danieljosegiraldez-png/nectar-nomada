import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Un test que crea directorios temporales los limpia.
 *
 * **Por qué existe.** `CLAUDE.md` lo pide desde hace tiempo —«si una suite usa
 * directorios temporales, limpiarlos con reintentos; atrapar un error de
 * recurso ocupado convierte una carrera perdida en basura permanente»— y aun
 * así el 2026-09-05 llegó a `main` un test que creaba cinco por corrida y no
 * borraba ninguno. La regla estaba escrita en prosa, y la prosa se salta.
 *
 * El coste no es teórico: el disco de esta máquina llegó al 100 % el
 * 2026-08-31, y el primer síntoma fue un `npm ci` que fallaba con exit 1 en un
 * checkout limpio, que parece un repositorio roto hasta que se leen las líneas
 * `ENOSPC` enterradas entre avisos de `tar`.
 *
 * **Se ata a la fuente, no a una lista escrita a mano**, igual que
 * `booleanos-de-tres-estados.test.ts`: el test que alguien añada mañana entra
 * solo.
 *
 * Hermético: sólo lee archivos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

function archivosDeTest(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivosDeTest(ruta));
    else if (entrada.endsWith(".test.ts") || entrada.endsWith(".test.mjs")) salida.push(ruta);
  }
  return salida;
}

const CREA = /\bmkdtempSync\b|\bmkdtemp\(/;
const LIMPIA = /\brmSync\b|\brmdirSync\b|\bfs\.rm\(|\brm\(/;

const conTemporales = archivosDeTest(join(RAIZ, "tests")).filter((f) =>
  CREA.test(readFileSync(f, "utf8")),
);

describe("los tests que crean temporales los limpian", () => {
  /**
   * **Control positivo, y no es ceremonia.** Si el barrido dejara de encontrar
   * archivos —una ruta mal puesta, una extensión nueva— la comprobación de
   * abajo pasaría sobre una lista vacía y diría que todo está bien sin haber
   * mirado nada.
   *
   * Es exactamente el defecto que este PR arregla en
   * `check-archivo-de-estado.mjs`, y sería ridículo reproducirlo aquí.
   */
  it("el barrido encuentra archivos: sin esto, lo de abajo pasa en vacío", () => {
    expect(conTemporales.length, "ningún test crea temporales: ¿se rompió el barrido?").toBeGreaterThan(0);
  });

  it("todos los que crean un temporal lo borran", () => {
    const sinLimpiar = conTemporales
      .filter((f) => !LIMPIA.test(readFileSync(f, "utf8")))
      .map((f) => relative(RAIZ, f));

    expect(
      sinLimpiar,
      "crean directorios temporales y no los borran. Cada corrida deja basura, " +
        "y la suite corre en cada PR y en cada iteración local. `CLAUDE.md` pide " +
        "limpiarlos con reintentos: `rmSync(dir, { recursive: true, force: true, " +
        "maxRetries: 3 })` en un `afterAll`, sin lanzar si falla.",
    ).toEqual([]);
  });
});
