/**
 * **Nadie lee el proceso de un lote fuera del resolvedor** — Parte 1, R7 (2026-10-02).
 *
 * ## El incidente que lo motiva (2026-09-30)
 * El proceso se abre sobre la cereza, y el secado, la bodega y la taza ocurren en sus descendientes.
 * Todo lo que buscaba el proceso «en el propio lote» —la compuerta de bodega, la ficha, la lista de
 * catas, la ocupación de tanques— dejaba de verlo a la primera generación, en silencio. La Parte 1
 * pasó todos a `procesoQueCubre`. Esto impide que uno nuevo vuelva al camino viejo.
 *
 * ## Qué mira
 * Cuatro formas de leer el proceso de un lote sin el resolvedor, fuera de
 * `lib/traceability/procesoDelLinaje.ts`:
 * - `lotProcess.find…({ where: { lotId` (por el propio lote)
 * - `lotProcesses:` (un `include`, `select` o `where` desde el lote)
 * - `lotProcess: { select|include` (por la clave de una corrida: el camino del tablero y la cola)
 * - `where: { id: x.lotProcessId` (lo mismo, en dos pasos)
 * Las de `findUnique({ where: { id` con un id ya resuelto no: buscan un proceso ya conocido. Tampoco
 * `where: { id: input.lotProcessId }`: ese proceso lo elige quien llama, no es la clave de ninguna
 * corrida (los servicios de `lotProcess.ts` lo reciben así), y por eso el cuarto patrón lo excluye.
 *
 * ## Qué NO mira
 * Una lectura escrita de otra forma (por ejemplo, un `where` construido en una variable aparte) no la
 * ve. Es una red para el camino de siempre, no una prueba de que no exista otro.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const DUENO = "lib/traceability/procesoDelLinaje.ts";

/**
 * Excepciones, cada una con su razón y con el NÚMERO EXACTO de lecturas que justifica. Con un
 * «al menos una», una segunda lectura por lote dentro del mismo archivo —por ejemplo en la compuerta
 * de bodega, que vive en lotProcess.ts— pasaría en verde. Así no.
 *
 * Las cifras son LO MEDIDO sobre el código real el 2026-10-02, no lo que el plan suponía.
 */
const EXCEPCIONES: Record<string, { razon: string; n: number }> = {
  "lib/traceability/lotProcess.ts": {
    razon:
      "`listarProcesosDeLote` lista los procesos PROPIOS del lote con `lotProcess.findMany({ where: { lotId } })`: " +
      "es otra pregunta que «cuál lo cubre», y la usan las pruebas. Es la única lectura por lote del archivo. " +
      "Las otras nueve `lotProcess.find…` que tiene leen por el id de un proceso ya conocido y no las cuenta el detector: " +
      "`cambiarObjetivoDeHumedad`, `cambiarIntencion`, `registrarIntervencion`, `cerrarProceso` (dos), " +
      "`puedeGestionarProceso`, y las que reciben `cobertura.vigente.id` o los ids de la cobertura del resolvedor " +
      "(`exigeSecadoTerminado`, `procesoQueDevolver`, `coberturaDelLote`).",
    n: 1,
  },
  "lib/traceability/reporteDeProceso.ts": {
    razon:
      "`reporteDeProceso` agrupa los procesos de cada lote por fila (`include: { lotProcesses }` sobre `lot.findMany`): " +
      "es un agregado sobre todos los lotes visibles y su lectura por linaje es la Parte 5 (diseño R7, «el resto del reporte queda para la Parte 5»). " +
      "Es la única lectura por lote del archivo.",
    n: 1,
  },
};

export function lecturasPorLote(fuente: string): string[] {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const patrones = [
    // por lote
    /lotProcess\.(?:findFirst|findMany|findUnique|findFirstOrThrow|findUniqueOrThrow|count)\(\s*\{\s*where:\s*\{\s*lotId\b/g,
    /\blotProcesses\s*:/g,
    // por la clave de la CORRIDA: el camino del incidente original (tablero, cola, tanques)
    /\blotProcess\s*:\s*\{\s*(?:select|include)\b/g,
    // `input.` queda fuera: un proceso que elige quien llama no es la clave de una corrida
    /where:\s*\{\s*id:\s*(?!input\.)\w+\.lotProcessId\b/g,
  ];
  return patrones.flatMap((p) => [...sinComentarios.matchAll(p)].map((m) => m[0]));
}

function fuentes(dir: string): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) out.push(...fuentes(ruta));
    else if (/\.(ts|tsx)$/.test(nombre)) out.push(relative(RAIZ, ruta));
  }
  return out;
}

describe("el proceso de un lote se lee por el resolvedor", () => {
  it("el detector caza las cuatro formas (control del propio análisis)", () => {
    expect(lecturasPorLote("prisma.lotProcess.findFirst({ where: { lotId } })")).toHaveLength(1);
    expect(lecturasPorLote("include: { lotProcesses: { take: 1 } }")).toHaveLength(1);
    expect(lecturasPorLote("lotProcess: { select: { lotId: true } }")).toHaveLength(1);
    expect(lecturasPorLote("lotProcess: { select: procesoSelect }")).toHaveLength(1);
    expect(lecturasPorLote("prisma.lotProcess.findUnique({ where: { id: c.lotProcessId } })")).toHaveLength(1);
    expect(lecturasPorLote("prisma.lotProcess.findUnique({ where: { id } })")).toHaveLength(0);
    // un proceso que elige quien llama no es la clave de una corrida
    expect(lecturasPorLote("prisma.lotProcess.findUnique({ where: { id: input.lotProcessId } })")).toHaveLength(0);
    expect(lecturasPorLote("lotProcessId: proceso.id,")).toHaveLength(0);
    expect(lecturasPorLote("// lotProcess.findFirst({ where: { lotId } })")).toHaveLength(0);
  });

  it("mira el repositorio de verdad: más de 100 archivos, y el resolvedor dispara su propio detector", () => {
    const todos = [...fuentes(join(RAIZ, "lib")), ...fuentes(join(RAIZ, "app"))];
    expect(todos.length).toBeGreaterThan(100);
    expect(lecturasPorLote(readFileSync(join(RAIZ, DUENO), "utf8")).length).toBeGreaterThan(0);
  });

  it("fuera del resolvedor y de las excepciones escritas, nadie lee procesos por lote", () => {
    const culpables = [...fuentes(join(RAIZ, "lib")), ...fuentes(join(RAIZ, "app"))]
      .filter((f) => f !== DUENO && !(f in EXCEPCIONES))
      .filter((f) => lecturasPorLote(readFileSync(join(RAIZ, f), "utf8")).length > 0);
    expect(culpables, `leen el proceso por lote sin pasar por ${DUENO}: ${culpables.join(", ")}`).toEqual([]);
  });

  it("cada excepción lee EXACTAMENTE lo que justifica: ni una de más, ni de adorno", () => {
    for (const [f, { n }] of Object.entries(EXCEPCIONES)) {
      expect(lecturasPorLote(readFileSync(join(RAIZ, f), "utf8")).length, `${f}: se esperaban ${n} lecturas por lote`).toBe(n);
    }
  });
});
