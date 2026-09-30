import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Toda escritura que guarde una persona elegida en un formulario pasa por
 * `exigirPersonaPermitida` (`lib/people/quienLoHizo.ts`).
 *
 * **Por qué existe (2026-09-21, decisión P-G de Daniel).** Unos 50 sitios de `lib/` guardaban el
 * `operatorPersonId` que mandara el formulario sin mirar de quién era: se podía anotar como autor
 * de una inspección a una persona de otra finca. El arreglo puso el guardia en cada uno; este test
 * existe para que el sitio número 51 no nazca sin él. Y ya cazó cinco que el inventario a mano no
 * había visto —tres de fotos, uno de socios y uno de custodia—.
 *
 * **Qué mide, dicho con precisión.** Recorre `lib/**.ts`, busca asignaciones de la forma
 * `<algo>PersonId: input.<campo>` (o `personId:`, o desde `r.` como en rutinas), y exige que la
 * función de primer nivel que las contiene llame a `exigirPersonaPermitida`. Las excepciones van en
 * `NO_ES_QUIEN_LO_HIZO`, cada una con su motivo.
 *
 * **Lo que NO mide:** un id que llega por otra variable (`const decidio = input.x ?? …`) y se
 * asigna después, ni que el ancla que se pasa sea la correcta. Lo primero lo cubre la revisión; lo
 * segundo, las pruebas con base de cada familia.
 *
 * Hermético: sólo lee archivos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

const archivos = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const ruta = join(dir, e);
    return statSync(ruta).isDirectory() ? archivos(ruta) : /\.ts$/.test(e) ? [ruta] : [];
  });

/** Comentarios fuera, conservando las líneas: un ejemplo en un docstring no es una escritura. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/.*$/gm, (m, p1: string) => p1);

const ESCRITURA = /\b([A-Za-z]*[pP]ersonId)\s*:\s*(?:input|r)\.[A-Za-z.]+/g;
const FUNCION = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm;

/** `archivo:función` que guardan una persona y NO son «quién lo hizo», con su motivo. */
const NO_ES_QUIEN_LO_HIZO: Record<string, string> = {
  "lib/notificaciones/canales.ts:declararCanal": "la persona es el DESTINATARIO de un aviso, no quien hizo un trabajo",
  "lib/sensory/calibration.ts:createCalibrationSession": "panel sensorial de plataforma: no hay finca en que anclar",
  "lib/sensory/calibration.ts:recordCalibrationResult": "el evaluador es el SUJETO medido en la calibración, no un autor",
  "lib/sync/devices.ts:registerDevice": "el operador de un aparato es su dueño, y un aparato no tiene finca",
  "lib/sync/deviceTokens.ts:registrarAparato": "ídem: el aparato no tiene finca",
  "lib/traceability/selection.ts:recordSelection": "no escribe: lo pasa a recordTransformation, que tiene el guardia",
  // **Falso positivo del detector, y vale la pena decirlo:** aquí `personId: input.personId` está en
  // un `where`, buscando a quién dar de baja — no escribe atribución. El detector casa la FORMA
  // `algoPersonId: input.x` y no distingue un `where` de un `data`. Mientras eso siga así, una
  // escritura escondida dentro de un objeto con forma de filtro se le pasaría; queda anotado.
  "lib/traceability/jornadasDeCosecha.ts:darDeBajaRecolector": "cierra el periodo de un recolector; el personId va en el `where`, no en lo escrito, y quien llama ya pasó por exigeGestionarFinca",
  "lib/traceability/trilla.ts:registrarTrilla": "no escribe: lo pasa a recordTransformation, que tiene el guardia",
  "lib/traceability/drying.ts:cerrarCorridaEnTransaccion": "ayudante transaccional: endDryingRun y bajarBandeja autorizan y validan a la persona antes de llamarlo",
  "lib/traceability/operations.ts:crearConsumoEnTx": "ayudante transaccional: recordMaterialConsumptionEntry y registrarRealizada autorizan y validan a la persona antes de llamarlo",
  "lib/traceability/samplingEvents.ts:crearInspeccionEnTransaccion": "ayudante transaccional: createSamplingEvent y recordMeasurement autorizan y validan a la persona antes de llamarlo",
};

export function escriturasSinGuardia(ruta: string, fuente: string): { sitio: string; linea: number }[] {
  const limpio = sinComentarios(fuente);
  const funciones = [...limpio.matchAll(FUNCION)].map((m) => ({ nombre: m[1]!, inicio: m.index! }));
  const salida: { sitio: string; linea: number }[] = [];
  for (const m of limpio.matchAll(ESCRITURA)) {
    const i = funciones.findLastIndex((f) => f.inicio < m.index!);
    if (i < 0) continue;
    const f = funciones[i]!;
    const fin = funciones[i + 1]?.inicio ?? limpio.length;
    if (limpio.slice(f.inicio, fin).includes("exigirPersonaPermitida(")) continue;
    salida.push({ sitio: `${ruta}:${f.nombre}`, linea: limpio.slice(0, m.index).split("\n").length });
  }
  return salida;
}

describe("quién lo hizo, con su guardia", () => {
  const todos = archivos(join(RAIZ, "lib")).map((a) => ({ ruta: relative(RAIZ, a), fuente: readFileSync(a, "utf8") }));

  it("el detector encuentra escrituras de verdad (control positivo del análisis)", () => {
    const encontradas = todos.flatMap(({ fuente }) => [...sinComentarios(fuente).matchAll(ESCRITURA)]);
    // Medido el 2026-09-21: 66. Si cae muy por debajo, el detector se quedó ciego.
    expect(encontradas.length).toBeGreaterThanOrEqual(50);
  });

  it("caza una escritura sin guardia y deja pasar la que lo tiene", () => {
    const mala = "export async function f(userAccountId: string, input: X) {\n  await tx.a.create({ data: { operatorPersonId: input.operatorPersonId } });\n}\n";
    const buena = "export async function g(userAccountId: string, input: X) {\n  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, []);\n  await tx.a.create({ data: { operatorPersonId: input.operatorPersonId } });\n}\n";
    expect(escriturasSinGuardia("x.ts", mala)).toEqual([{ sitio: "x.ts:f", linea: 2 }]);
    expect(escriturasSinGuardia("x.ts", buena)).toEqual([]);
    // El guardia de OTRA función no cuenta.
    expect(escriturasSinGuardia("x.ts", buena + mala)).toEqual([{ sitio: "x.ts:f", linea: 6 }]);
  });

  it("toda escritura de una persona pasa por exigirPersonaPermitida, salvo las excepciones nombradas", () => {
    const sin = todos.flatMap(({ ruta, fuente }) => escriturasSinGuardia(ruta, fuente)).filter((s) => !(s.sitio in NO_ES_QUIEN_LO_HIZO));
    expect(sin).toEqual([]);
  });

  it("cada excepción sigue existiendo: una excepción muerta se lee como cobertura", () => {
    const vivas = new Set(todos.flatMap(({ ruta, fuente }) => escriturasSinGuardia(ruta, fuente)).map((s) => s.sitio));
    expect(Object.keys(NO_ES_QUIEN_LO_HIZO).filter((k) => !vivas.has(k))).toEqual([]);
  });

  it("los ayudantes transaccionales nuevos conservan el guardia en sus dos caminos", () => {
    const bandejas = readFileSync(join(RAIZ, "lib/traceability/bandejasDelSecado.ts"), "utf8");
    const operaciones = readFileSync(join(RAIZ, "lib/traceability/operations.ts"), "utf8");
    const rutinas = readFileSync(join(RAIZ, "lib/rutinas/rutinas.ts"), "utf8");
    expect(bandejas).toMatch(/function bajarBandeja[\s\S]*exigirPersonaPermitida[\s\S]*cerrarCorridaEnTransaccion/);
    expect(operaciones).toMatch(/function recordMaterialConsumptionEntry[\s\S]*exigirPersonaPermitida[\s\S]*crearConsumoEnTx/);
    expect(rutinas).toMatch(/function registrarRealizada[\s\S]*exigirPersonaPermitida[\s\S]*crearConsumoEnTx/);
  });
});
