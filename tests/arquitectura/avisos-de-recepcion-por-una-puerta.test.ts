/**
 * Los avisos de recepción se leen por UNA puerta — Parte 2a, tarea 12 (R15, revisión adversaria del 2026-10-05; Ruling INV, T06-INV).
 *
 * **Por qué existe.** `avisosDeRecepcion(tx, lotId)` (`lib/recetas/recepcion.ts`) NO autoriza: devuelve ids, fechas y Brix de las
 * recepciones de TODA la ascendencia del lote, incluidas las de lotes que quien mira no ve. Su única defensa era una frase de prosa
 * —«quien la llame debe haber autorizado el lote antes», en la allowlist— y el inventario de acceso la clasifica «depende del
 * llamador», que es una etiqueta y no una protección (Ruling INV del registro: un comentario basta para engañarlo). Lo que cierra el
 * agujero es que quien la llame sea UNO, y que ése autorice: `lib/recetas/paraLasPantallas.ts` (tarea 13: `avisosParaLaPagina` pide
 * `view` sobre el lote y después la llama, y filtra lo que enseña de las recepciones de lotes que quien mira no ve). Este guardia fija lo
 * primero: **ningún otro archivo de producción la importa**.
 *
 * **Lo que NO mide.** Que esa puerta autorice bien: lo prueba la suya (`tests/recetas/avisosParaLaPagina.test.ts`, «quien no ve el lote
 * no recibe avisos»). Ni que la puerta exista: que la función tenga quien la pinte lo exige `ritmo-con-quien-lo-lea` (tarea 13).
 * Aquel guardia exige que haya al menos un consumidor; éste, que no haya más que uno: son las dos mitades.
 *
 * **Se mira el import del SÍMBOLO, no el nombre ni el módulo.** Dos versiones más simples fallan cada una de una manera:
 * - buscar la palabra `avisosDeRecepcion` marca un comentario que la menciona (código correcto) y es satisfecha por una constante
 *   local con el mismo nombre —el flip de `ritmo-con-quien-lo-lea` lo enseñó el 2026-09-27—;
 * - marcar cualquier import del módulo marcaría a quien trae sólo los TIPOS o la lista `TIPOS_DE_AVISO_DE_RECEPCION`, que no leen
 *   ninguna recepción y la tarea 13 necesita en sus pantallas.
 * Cuentan como importar la función: `import { avisosDeRecepcion … }` (con alias, en varias líneas, junto a un `type X` en línea),
 * `import * as`, `export * from` y `export { avisosDeRecepcion } from` (con ellos se llega a ella sin nombrarla), y `import()` /
 * `require()` del módulo (no se distingue el tipo del valor: se cuenta). **No** cuentan `import type`, otro símbolo del módulo, un
 * comentario, una cadena que parece un import, ni otro módulo que también se llame `recepcion`: el especificador se resuelve a una
 * ruta del repositorio (relativo o con `@/`) y se compara con la del módulo.
 *
 * **El detector tiene su control en las dos direcciones** (las fuentes sintéticas de abajo): un guardia que sólo se prueba contra el
 * árbol real pasa en verde si el detector deja de ver, y los importadores reales son cero hoy. Y se aplica a UN archivo real que sí
 * importa la función —la prueba de la tarea 12—, para que un cambio en la forma del import lo ponga en rojo y no en silencio.
 *
 * **Lee todo lo que no sea prueba, y no una lista**: recorre el árbol entero salvo `node_modules`, `generated`, `tests` y los
 * directorios que empiezan por punto, sin seguir enlaces simbólicos. Las pruebas la importan a propósito. El archivo que mañana alguien
 * añada entra solo.
 *
 * Hermético: sólo lee archivos.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { sinComentarios } from "../helpers/sinComentarios";

const RAIZ = new URL("../..", import.meta.url).pathname;

/** El módulo que define la función: ruta del repositorio, sin extensión. */
const MODULO = "lib/recetas/recepcion";
const SIMBOLO = "avisosDeRecepcion";
/** La única puerta (tarea 13). No hace falta que exista todavía: el guardia dice quién PUEDE importarla, no que alguien lo haga. */
const PUERTA = "lib/recetas/paraLasPantallas.ts";

/** A qué ruta del repositorio (sin extensión ni `/index`) apunta un especificador de import; `null` si es un paquete. */
function destino(desde: string, especificador: string): string | null {
  const base = especificador.startsWith("@/")
    ? especificador.slice(2)
    : especificador.startsWith(".")
      ? posix.join(posix.dirname(desde), especificador)
      : null;
  return base === null ? null : base.replace(/\.(ts|tsx|mts|js|mjs)$/, "").replace(/\/index$/, "");
}

/** ¿Importa `fuente` —el contenido del archivo `archivo`, ruta del repositorio— la FUNCIÓN `avisosDeRecepcion`? */
function importaLaFuncion(fuente: string, archivo: string): boolean {
  const limpia = sinComentarios(fuente);
  // Estático: `import … from "x"` y `export … from "x"`; la cláusula puede ocupar varias líneas y no puede cruzar un `;` ni una
  // comilla. El ancla de principio de línea deja fuera una cadena que contenga la palabra a media línea.
  for (const m of limpia.matchAll(/^[ \t]*(?:import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*["']([^"']+)["']/gm)) {
    const [, soloTipos, clausula, especificador] = m;
    if (destino(archivo, especificador!) !== MODULO) continue;
    if (soloTipos) continue;
    if (clausula!.includes("*")) return true;
    const nombres = (/\{([^}]*)\}/.exec(clausula!)?.[1] ?? "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    if (nombres.some((n) => !n.startsWith("type ") && n.split(/\s+as\s+/)[0]!.trim() === SIMBOLO)) return true;
  }
  // Dinámico: `import("x")` y `require("x")`.
  for (const m of limpia.matchAll(/\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (destino(archivo, m[1]!) === MODULO) return true;
  }
  return false;
}

/** Todo el código de producción, como rutas del repositorio: el árbol entero salvo lo que se dice arriba. */
function fuentesDeProduccion(dir: string = RAIZ): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const nombre = entrada.name;
    if (nombre === "node_modules" || nombre === "generated" || nombre === "tests" || nombre.startsWith(".")) continue;
    const ruta = join(dir, nombre);
    if (entrada.isDirectory()) salida.push(...fuentesDeProduccion(ruta));
    else if (entrada.isFile() && /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(nombre)) salida.push(relative(RAIZ, ruta).split(sep).join("/"));
  }
  return salida;
}

/** `[nombre, archivo que lo contiene, fuente, ¿es un importador de la función?]` */
const CASOS: ReadonlyArray<readonly [string, string, string, boolean]> = [
  // — Lo que cuenta como importarla.
  ["un import de una línea", "lib/otro/uno.ts", `import { avisosDeRecepcion } from "../recetas/recepcion";`, true],
  [
    "un import de varias líneas",
    "lib/otro/uno.ts",
    `import {\n  TIPOS_DE_AVISO_DE_RECEPCION,\n  avisosDeRecepcion,\n} from "../recetas/recepcion";`,
    true,
  ],
  ["con alias", "lib/otro/uno.ts", `import { avisosDeRecepcion as avisos } from "../recetas/recepcion";`, true],
  [
    "junto a un tipo en línea, que es la forma de la puerta",
    "lib/recetas/paraLasPantallas.ts",
    `import { avisosDeRecepcion, type AvisoDeRecepcion } from "./recepcion";`,
    true,
  ],
  ["con la ruta con alias @/", "app/lots/x/page.tsx", `import { avisosDeRecepcion } from "@/lib/recetas/recepcion";`, true],
  [
    "con la ruta relativa desde un directorio con corchetes",
    "app/lots/[id]/page.tsx",
    `import { avisosDeRecepcion } from "../../../lib/recetas/recepcion";`,
    true,
  ],
  ["con import * as (espacio de nombres)", "lib/otro/uno.ts", `import * as recepcion from "../recetas/recepcion";`, true],
  ["reexportada con su nombre", "lib/otro/uno.ts", `export { avisosDeRecepcion } from "../recetas/recepcion";`, true],
  ["reexportada con export *", "lib/otro/uno.ts", `export * from "../recetas/recepcion";`, true],
  ["con un import dinámico", "lib/otro/uno.ts", `const { avisosDeRecepcion } = await import("../recetas/recepcion");`, true],
  ["con require", "lib/otro/uno.ts", `const recepcion = require("../recetas/recepcion");`, true],
  // — Lo que NO cuenta, cada uno con la razón en su nombre. Son el control: un detector que lo marcara enseñaría a ignorarlo.
  ["sólo tipos: import type", "lib/otro/uno.ts", `import type { AvisosDeRecepcion } from "../recetas/recepcion";`, false],
  [
    "otro símbolo del módulo: la lista de tipos de aviso",
    "lib/otro/uno.ts",
    `import { TIPOS_DE_AVISO_DE_RECEPCION } from "../recetas/recepcion";`,
    false,
  ],
  [
    "el tipo del aviso en línea y otra función, sin la función",
    "lib/otro/uno.ts",
    `import { type AvisoDeRecepcion, juzgarBrix } from "../recetas/recepcion";`,
    false,
  ],
  ["un símbolo de nombre parecido", "lib/otro/uno.ts", `import { avisosDeRecepcionDeOtraCosa } from "../recetas/recepcion";`, false],
  [
    "otro módulo que también se llama recepcion",
    "lib/otro/uno.ts",
    `import { avisosDeRecepcion } from "../traceability/recepcion";`,
    false,
  ],
  ["un paquete con ese nombre", "lib/otro/uno.ts", `import { avisosDeRecepcion } from "recepcion";`, false],
  [
    "un comentario de línea y uno de bloque con asterisco",
    "lib/otro/uno.ts",
    `// import { avisosDeRecepcion } from "../recetas/recepcion";\n/**\n * import { avisosDeRecepcion } from "../recetas/recepcion";\n */\nconst a = 1;`,
    false,
  ],
  [
    "un comentario de bloque sin asterisco al principio de la línea",
    "lib/otro/uno.ts",
    `/*\nimport { avisosDeRecepcion } from "../recetas/recepcion";\n*/\nconst a = 1;`,
    false,
  ],
  [
    "una cadena que parece un import, a media línea",
    "lib/otro/uno.ts",
    `const ejemplo = 'import { avisosDeRecepcion } from "../recetas/recepcion"';`,
    false,
  ],
  [
    "el archivo que la define no se importa a sí mismo",
    "lib/recetas/recepcion.ts",
    `export async function avisosDeRecepcion(tx: Prisma.TransactionClient, lotId: string) {}`,
    false,
  ],
];

describe("avisosDeRecepcion se importa por una sola puerta", () => {
  describe("el detector, contra fuentes sintéticas", () => {
    for (const [nombre, archivo, fuente, esperado] of CASOS) {
      it(nombre, () => {
        expect(importaLaFuncion(fuente, archivo)).toBe(esperado);
      });
    }

    it("el cuadro tiene casos de las dos clases: un cuadro sólo de aciertos no controla nada", () => {
      expect(CASOS.filter((c) => c[3]).length).toBeGreaterThanOrEqual(8);
      expect(CASOS.filter((c) => !c[3]).length).toBeGreaterThanOrEqual(8);
    });
  });

  describe("el árbol real", () => {
    it("el escáner lee la producción entera —lib/ y app/— y ve el módulo que define la función; no lee las pruebas", () => {
      const todos = fuentesDeProduccion();
      expect(todos.filter((f) => f.startsWith("lib/")).length).toBeGreaterThan(200);
      expect(todos.filter((f) => f.startsWith("app/")).length).toBeGreaterThan(200);
      expect(todos).toContain(`${MODULO}.ts`);
      expect(todos.filter((f) => f.startsWith("tests/"))).toEqual([]);
    });

    it("el detector reconoce a un importador real —la prueba de la tarea 12— y no marca al módulo que define la función", () => {
      const prueba = "tests/recetas/recepcion.test.ts";
      expect(importaLaFuncion(readFileSync(join(RAIZ, prueba), "utf8"), prueba)).toBe(true);
      expect(importaLaFuncion(readFileSync(join(RAIZ, `${MODULO}.ts`), "utf8"), `${MODULO}.ts`)).toBe(false);
    });

    it("sólo lib/recetas/paraLasPantallas.ts importa avisosDeRecepcion", () => {
      const importadores = fuentesDeProduccion().filter(
        (f) => f !== `${MODULO}.ts` && importaLaFuncion(readFileSync(join(RAIZ, f), "utf8"), f),
      );
      const ajenos = importadores.filter((f) => f !== PUERTA);
      expect(
        ajenos,
        `avisosDeRecepcion no autoriza: sólo ${PUERTA} (que pide ver el lote antes) puede importarla; la importan también ${ajenos.join(", ")}`,
      ).toEqual([]);
    });
  });
});
