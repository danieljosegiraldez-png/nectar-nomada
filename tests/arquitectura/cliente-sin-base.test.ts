import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Un componente `"use client"` no puede alcanzar `lib/db.ts`, ni a través de
 * cuantos módulos haga falta.
 *
 * **Por qué existe.** El 2026-09-13 un formulario de campo importó dos
 * constantes de catálogo de `lib/apiary/objetivoDelTratamiento.ts`. Ese archivo
 * tenía el catálogo arriba y un reporte que lee la base abajo, y su propia
 * cabecera decía «pura y sin base de datos en su mitad de arriba». **Esa
 * frontera no existe para el empaquetador:** un `import { prisma }` a nivel de
 * módulo se traza aunque el navegador sólo use una constante. El bundle del
 * cliente acabó pidiendo `pg`, y con él `dns`, `fs`, `net` y `tls`.
 *
 * `main` dejó de construir y producción sirvió el build anterior. Ninguna PR
 * podía ponerse verde, porque el fallo se hereda de la base.
 *
 * **Y la compuerta no podía verlo**, igual que en `use-server-solo-async`: para
 * TypeScript el archivo es válido y `npm run verify` corre tipos, lint y
 * tests — **no `next build`**. Es el segundo error de esta familia, así que la
 * familia merece guardia y no otra promesa de tener cuidado.
 *
 * **Transitivo a propósito.** El fallo llegó por DOS saltos —componente →
 * catálogo → `lib/db`—, así que mirar sólo los imports directos habría pasado
 * en verde sobre el caso que lo motiva.
 *
 * **`import type` no cuenta**, y es la distinción que hace útil al guardia en
 * vez de molesto: un tipo se borra al compilar y no llega al bundle. Sin esta
 * regla habría que reescribir archivos correctos.
 *
 * Hermético: sólo lee archivos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const BASE = resolve(RAIZ, "lib/db.ts");

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

const esUseClient = (fuente: string) =>
  /^\s*(\/\/.*\n|\/\*[\s\S]*?\*\/\n|\n)*\s*["']use client["']\s*;/.test(fuente);

/**
 * **`"use server"` es una frontera y el recorrido para ahí.** Next.js no mete
 * ese módulo en el bundle del cliente: lo sustituye por llamadas al servidor, así
 * que lo que importe por dentro no llega al navegador. Sin esta regla el guardia
 * señalaba 27 componentes correctos —todos a través de `app/actions/*`— y un
 * guardia que nunca puede pasar enseña a ignorar una línea roja.
 */
const esUseServer = (fuente: string) =>
  /^\s*(\/\/.*\n|\/\*[\s\S]*?\*\/\n|\n)*\s*["']use server["']\s*;/.test(fuente);

/**
 * Los imports RELATIVOS que traen valores. `import type { X }` queda fuera
 * porque desaparece al compilar y nunca llega al navegador.
 */
function importesDeValor(fuente: string): string[] {
  const rutas: string[] = [];
  for (const m of fuente.matchAll(/^\s*import\s+([\s\S]*?)from\s+["'](\.[^"']+)["']/gm)) {
    if (/^\s*type\s/.test(m[1]!)) continue; // `import type { … } from` entero
    rutas.push(m[2]!);
  }
  return rutas;
}

/** `./x` → el archivo real, probando las extensiones que el proyecto usa. */
function resolver(desde: string, especificador: string): string | null {
  const crudo = resolve(dirname(desde), especificador);
  for (const cand of [crudo, `${crudo}.ts`, `${crudo}.tsx`, join(crudo, "index.ts"), join(crudo, "index.tsx")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

/** El camino desde `entrada` hasta `lib/db.ts`, o `null` si no lo alcanza. */
function caminoHastaLaBase(entrada: string): string[] | null {
  const vistos = new Set<string>();
  const pila: [string, string[]][] = [[entrada, [entrada]]];
  while (pila.length) {
    const [archivo, camino] = pila.pop()!;
    if (vistos.has(archivo)) continue;
    vistos.add(archivo);
    if (archivo === BASE) return camino;
    let fuente: string;
    try {
      fuente = readFileSync(archivo, "utf8");
    } catch {
      continue;
    }
    if (archivo !== entrada && esUseServer(fuente)) continue; // frontera: no sigue al navegador
    for (const esp of importesDeValor(fuente)) {
      const destino = resolver(archivo, esp);
      if (destino && !vistos.has(destino)) pila.push([destino, [...camino, destino]]);
    }
  }
  return null;
}

const TODOS = [...archivosFuente(join(RAIZ, "app")), ...archivosFuente(join(RAIZ, "lib"))];
const CLIENTES = TODOS.filter((f) => esUseClient(readFileSync(f, "utf8")));
const corto = (f: string) => relative(RAIZ, f);

describe("un componente de cliente no arrastra la base al navegador", () => {
  /**
   * **El control positivo del propio análisis**, sin el cual lo de abajo no
   * valdría nada. Un recorrido que no resuelve ningún import no encuentra
   * ningún incumplimiento y pasa en verde sin haber mirado: es la trampa que
   * `CLAUDE.md` documenta con el detector que la indentación dejó ciego.
   *
   * Así que se afirma que el recorrido ENCUENTRA: que hay componentes de
   * cliente, que sus imports relativos resuelven a archivos reales, y que
   * `lib/db.ts` es alcanzable desde ALGÚN sitio del árbol — si no lo fuera, la
   * respuesta «nadie la alcanza» sería cierta por vacío.
   */
  it("el recorrido resuelve imports de verdad y puede llegar a la base", () => {
    expect(CLIENTES.length, `componentes \`"use client"\` encontrados: ${CLIENTES.length}`).toBeGreaterThanOrEqual(20);

    const resueltos = CLIENTES.flatMap((f) =>
      importesDeValor(readFileSync(f, "utf8")).map((e) => resolver(f, e)),
    ).filter(Boolean);
    expect(resueltos.length, "el recorrido no resolvió ni un import: está ciego").toBeGreaterThanOrEqual(20);

    // Y que el destino que se vigila sea alcanzable de verdad desde el servidor.
    const servidor = join(RAIZ, "lib/apiary/tratamientosPorObjetivo.ts");
    expect(caminoHastaLaBase(servidor), "lib/db.ts no es alcanzable ni desde quien la importa").not.toBeNull();
  });

  it("ningún archivo `use client` alcanza lib/db.ts", () => {
    const culpables = CLIENTES.map((f) => [f, caminoHastaLaBase(f)] as const)
      .filter(([, camino]) => camino !== null)
      .map(([f, camino]) => `${corto(f)}  →  ${camino!.slice(1).map(corto).join("  →  ")}`);

    expect(
      culpables,
      "Un componente de cliente llega a la base y el navegador acabará pidiendo `pg`.\n" +
        "Parte el módulo intermedio: catálogo puro por un lado, lectura por otro,\n" +
        "como `alimentacion.ts` / `alcanceDelAlimento.ts`.\n" +
        culpables.join("\n"),
    ).toEqual([]);
  });
});
