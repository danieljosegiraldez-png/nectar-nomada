import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * De un archivo `"use server"` sólo se exportan funciones `async`.
 *
 * **Por qué existe.** El 2026-09-01 añadí `export class FechaInvalidaError` a
 * `app/actions/traceability.ts`, que es `"use server"`. Next.js convierte cada
 * export de un archivo así en un punto de entrada invocable desde el navegador,
 * y una clase no puede serlo, así que `next build` cayó con **69 errores**: el
 * módulo entero deja de resolver y con él los 25 componentes que lo importan.
 *
 * **Lo grave no fue el fallo, fue que la compuerta lo dejó pasar.** Para
 * TypeScript el archivo es válido, y `npm run verify` corre tipos, lint y tests
 * —no `next build`—, así que las cuatro PR de esa tanda salieron en verde
 * mientras producción servía el build anterior durante una hora. La compuerta
 * medía otra cosa.
 *
 * **Por qué un test de fuente y no `next build` en CI.** El build tarda minutos
 * y necesita entorno; esta regla se lee en el texto. No sustituye al build: lo
 * adelanta para el ÚNICO error de este tipo que ya nos costó una hora.
 *
 * Hermético: sólo lee archivos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

/** Todos los `.ts`/`.tsx` bajo `app/` y `lib/`, sin `node_modules`. */
const archivosFuente = (dir: string): string[] => {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivosFuente(ruta));
    else if (/\.tsx?$/.test(entrada)) salida.push(ruta);
  }
  return salida;
};

/** Un archivo es `"use server"` si la directiva encabeza el módulo. */
const esUseServer = (fuente: string) =>
  /^\s*(\/\/.*\n|\/\*[\s\S]*?\*\/\n|\n)*\s*["']use server["']\s*;/.test(fuente);

/**
 * Los `export` de nivel superior que NO son `export async function`.
 *
 * `export type`, `export interface` y `export { type X }` se borran al
 * compilar: no llegan al bundle y Next.js no los cuenta. Todo lo demás —clase,
 * `const`, `let`, `var`, función síncrona, `export default`— es un valor
 * exportado y rompe el build.
 */
const exportsProhibidos = (fuente: string): string[] =>
  fuente
    .split("\n")
    .map((linea, i) => [i + 1, linea] as const)
    .filter(([, linea]) => /^export\b/.test(linea))
    .filter(([, linea]) => !/^export\s+async\s+function\b/.test(linea))
    .filter(([, linea]) => !/^export\s+(type|interface)\b/.test(linea))
    .filter(([, linea]) => !/^export\s*\{\s*type\b/.test(linea))
    .map(([n, linea]) => `${n}: ${linea.trim()}`);

describe("un archivo \"use server\" sólo exporta funciones async", () => {
  const useServer = ["app", "lib"]
    .flatMap((d) => archivosFuente(join(RAIZ, d)))
    .map((ruta) => [relative(RAIZ, ruta), readFileSync(ruta, "utf8")] as const)
    .filter(([, fuente]) => esUseServer(fuente));

  /**
   * Control positivo. Una comprobación negativa sobre una lista vacía sale
   * verde y no prueba nada — es la tercera de las reglas de `CLAUDE.md`. Si un
   * refactor cambia dónde viven las acciones, esto cae antes que el resto.
   */
  it("encuentra los archivos \"use server\" donde deben estar", () => {
    // Quince el 2026-09-01, todos en `app/actions/`. El umbral es `>=` para no
    // romper al añadir una acción nueva; lo que vigila es que el detector siga
    // ENCONTRANDO algo. La primera versión de este test esperaba 25 y cayó:
    // ese número salía de un `git grep -l` cortado con `head`, que además
    // cuenta archivos con la directiva DENTRO de una función. Aquí no hay
    // ninguno, pero el día que lo haya no es este test quien debe verlo.
    expect(useServer.length).toBeGreaterThanOrEqual(15);
    expect(useServer.map(([ruta]) => ruta)).toContain(
      "app/actions/traceability.ts",
    );
    expect(useServer.every(([ruta]) => ruta.startsWith("app/actions/"))).toBe(
      true,
    );
  });

  it.each(useServer.map(([ruta]) => ruta))("%s", (ruta) => {
    const [, fuente] = useServer.find(([r]) => r === ruta)!;
    expect(exportsProhibidos(fuente)).toEqual([]);
  });
});
