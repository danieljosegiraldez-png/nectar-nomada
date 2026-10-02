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
 * Formas de leer el proceso de un lote sin el resolvedor, fuera de `lib/traceability/procesoDelLinaje.ts`:
 * - `lotProcess.find…|count|aggregate|groupBy(…)` cuyo `where` filtra por el lote —`lotId` en CUALQUIER posición, o la
 *   relación `lot`— o que agrupa `by: ["lotId"]`. Se mide contando paréntesis y llaves, no sangrías ni «lotId es la
 *   primera clave»: el primer detector sólo veía `findX({ where: { lotId`.
 * - `lotProcesses:` (un `include`, `select` o `where` desde el lote)
 * - `lotProcess: true` y `lotProcess: { … }` (por la clave de una corrida: el camino del tablero y la cola; también un
 *   filtro `where: { lotProcess: { lotId } }`). Las ESCRITURAS —`connect`, `create`— no son lecturas y no se marcan.
 * - `where: { …, id: x.lotProcessId` (lo mismo, en dos pasos), con `id` en cualquier posición del `where` mientras no haya
 *   llaves antes.
 * - Y aparte, otra prueba: nadie fuera de `lotProcess.ts` usa `listarProcesosDeLote` (llamada, importación o alias).
 * Las de `findUnique({ where: { id` con un id ya resuelto no: buscan un proceso ya conocido, aunque además seleccionen
 * `lotId`. Tampoco `where: { id: input.lotProcessId }`: ese proceso lo elige quien llama, no es la clave de ninguna
 * corrida (los servicios de `lotProcess.ts` lo reciben así), y por eso el patrón lo excluye.
 *
 * ## La excepción es del ARCHIVO, no de quien llama (ronda de arreglo 1, 2026-10-02)
 * `lotProcess.ts` está exento porque `listarProcesosDeLote` lee por lote. Pero esa función está EXPORTADA: eximir el archivo
 * sin vigilar a quien la llama dejaba que la ficha o la página del proceso —que en `main` leían así— volvieran al camino
 * viejo a través de ella con el guardia en verde. Por eso hay una prueba que mira a los llamadores.
 *
 * ## Qué NO mira (límites conocidos; cada uno tiene su caso `toHaveLength(0)` en la prueba, para que quien lo ensanche lo
 * ## cambie a sabiendas)
 * - Un `where` o unos argumentos construidos en una variable aparte (`where: donde`, `findFirst(args)`).
 * - El cliente por un alias (`const lp = prisma.lotProcess; lp.findFirst(…)`).
 * - SQL crudo sobre `traceability.lot_process`.
 * - La lista de ids de las corridas (`id: { in: corridas.map((c) => c.lotProcessId) }`): no se distingue de la lista de ids de
 *   la cobertura del resolvedor, que sí es legítima (`coberturaDelLote`).
 * - La clave de la corrida con un valor que no es literal (`where: { lotProcess: filtro }`).
 * - Un objeto de VISTA con la clave `lotProcess: { … }` SÍ se marcaría (falso positivo): hoy ninguno de `lib/` ni `app/` lo
 *   tiene —medido—; si aparece, se le cambia el nombre a la clave.
 * Es una red para el camino de siempre, no una prueba de que no exista otro.
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
      "La excepción es de ESTE archivo y no de quien la llame: ningún otro archivo de `lib/` ni `app/` puede usarla " +
      "(prueba «nadie fuera de lotProcess.ts usa listarProcesosDeLote…»). " +
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

/**
 * Los comentarios fuera, SALTANDO las cadenas (ronda de arreglo 1, 2026-10-02). Un `/*` o un `//` dentro de una cadena
 * —`accept="image/*"`, `"a // b"`— no abre un comentario: con el quitacomentarios anterior, una lectura por lote escrita
 * después de un `accept="image/*"` quedaba escondida hasta el siguiente cierre de comentario. Las cadenas se conservan tal
 * cual: comillas simples y dobles (que no cruzan de línea, así que un apóstrofo suelto en un JSX no se traga el resto) y
 * plantillas. Y `://` fuera de una cadena tampoco es un comentario.
 */
export function sinComentarios(fuente: string): string {
  return fuente.replace(
    /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\[\s\S])*`)|\/\*[\s\S]*?\*\/|(?<!:)\/\/.*$/gm,
    (_coincidencia, cadena?: string) => cadena ?? "",
  );
}

/** El texto entre `abre` —un `(` o un `{`— y su cierre, contando delimitadores y no sangrías. */
function balanceado(fuente: string, abre: number): string {
  const apertura = fuente[abre];
  const cierre = apertura === "(" ? ")" : "}";
  let profundidad = 0;
  for (let i = abre; i < fuente.length; i++) {
    if (fuente[i] === apertura) profundidad++;
    else if (fuente[i] === cierre && --profundidad === 0) return fuente.slice(abre + 1, i);
  }
  return fuente.slice(abre + 1);
}

const LECTURAS_DE_LOTPROCESS =
  /\blotProcess\.(?:findFirst|findMany|findUnique|findFirstOrThrow|findUniqueOrThrow|count|aggregate|groupBy)\(/g;

/**
 * Una lectura de `lotProcess` cuyo `where` filtra por el lote —`lotId` o la relación `lot`, en cualquier posición— o un
 * `groupBy` por `lotId`. Sólo se mira el `where`: `findUnique({ where: { id }, select: { lotId: true } })` lee un proceso ya
 * conocido y no cuenta.
 */
function porElLote(codigo: string): string[] {
  const aciertos: string[] = [];
  for (const m of codigo.matchAll(LECTURAS_DE_LOTPROCESS)) {
    const argumentos = balanceado(codigo, m.index! + m[0].length - 1);
    const filtra = [...argumentos.matchAll(/\bwhere\s*:\s*\{/g)].some((w) =>
      /\blotId\b|\blot\s*:/.test(balanceado(argumentos, w.index! + w[0].length - 1)),
    );
    const agrupa = /\bby\s*:\s*\[[^\]]*\blotId\b/.test(argumentos);
    if (filtra || agrupa) aciertos.push(m[0]);
  }
  return aciertos;
}

export function lecturasPorLote(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const patrones = [
    // por lote, desde el lote
    /\blotProcesses\s*:/g,
    // por la clave de la CORRIDA: el camino del incidente original (tablero, cola, tanques). Las escrituras no.
    /\blotProcess\s*:\s*(?:true\b|\{(?!\s*(?:connect|create|connectOrCreate)\b))/g,
    // en dos pasos; `input.` queda fuera: un proceso que elige quien llama no es la clave de una corrida
    /where:\s*\{[^{}]*?\bid:\s*(?!input\.)\w+\.lotProcessId\b/g,
  ];
  return [...porElLote(codigo), ...patrones.flatMap((p) => [...codigo.matchAll(p)].map((m) => m[0]))];
}

/** `listarProcesosDeLote` escrito en CÓDIGO (no en un comentario): una llamada, una importación o un alias. */
export function usaListarProcesosDeLote(fuente: string): boolean {
  return /\blistarProcesosDeLote\b/.test(sinComentarios(fuente));
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

  // Ronda de arreglo 1 (2026-10-02): las formas cotidianas de las MISMAS lecturas. Un caso de control por forma que el
  // detector ve, escrito como el código real las escribe.
  const FORMAS_QUE_VE: Array<[string, string]> = [
    ["lotId como segunda clave del where", "prisma.lotProcess.findFirst({ where: { endedAt: null, lotId } })"],
    ["lotId tras un filtro con llaves", "prisma.lotProcess.findFirst({ where: { endedAt: { not: null }, lotId } })"],
    ["where que no es la primera clave del argumento", 'prisma.lotProcess.findFirst({ orderBy: { sequenceOrder: "desc" }, where: { lotId } })'],
    ["select antes del where", "prisma.lotProcess.findMany({ select: { id: true }, where: { lotId } })"],
    ["where multilínea", "prisma.lotProcess.findFirst({\n  where: {\n    endedAt: null,\n    lotId,\n  },\n})"],
    ["filtro por la relación lot", "prisma.lotProcess.findMany({ where: { lot: { id: loteElegido } } })"],
    ["aggregate por lote", "prisma.lotProcess.aggregate({ where: { lotId }, _max: { sequenceOrder: true } })"],
    ["groupBy con where por lote", 'prisma.lotProcess.groupBy({ where: { lotId: { in: ids } }, by: ["closureKind"], _count: true })'],
    ["groupBy agrupando por lotId", 'prisma.lotProcess.groupBy({ by: ["lotId"], _count: true })'],
    ["la clave de la corrida en su forma corta", "prisma.fermentationRun.findMany({ include: { lotProcess: true } })"],
    ["filtro desde la corrida", "prisma.fermentationRun.findMany({ where: { lotProcess: { lotId } } })"],
    ["id de la corrida que no es la primera clave", "prisma.lotProcess.findUnique({ where: { endedAt: null, id: c.lotProcessId } })"],
  ];
  it.each(FORMAS_QUE_VE)("caza la forma: %s", (_nombre, fuente) => {
    expect(lecturasPorLote(fuente)).toHaveLength(1);
  });

  // Lo que el código bueno SÍ escribe y no puede salir marcado (las tres primeras son del repositorio real).
  const FORMAS_QUE_NO_MARCA: Array<[string, string]> = [
    ["lectura por id que además selecciona lotId", "await prisma.lotProcess.findUnique({ where: { id: lotProcessId }, select: { lotId: true } });"],
    ["lectura por una lista de ids", "await prisma.lotProcess.findMany({ where: { id: { in: ids } }, include: INCLUIR_PARA_PANTALLA });"],
    ["lectura por el id de la cobertura", "await tx.lotProcess.findUniqueOrThrow({ where: { id: cobertura.vigente.id }, include: { closingMoistureMeasurement: true } });"],
    ["proceso que elige quien llama, no primera clave", "prisma.lotProcess.findUnique({ where: { endedAt: null, id: input.lotProcessId } })"],
    ["escritura con la clave de la corrida", "await prisma.fermentationRun.create({ data: { lotProcess: { connect: { id: proceso.id } } } });"],
    ["lectura por lote de OTRO modelo", "await prisma.measurement.findMany({ where: { lotId: lot.id }, select: { id: true } });"],
  ];
  it.each(FORMAS_QUE_NO_MARCA)("no marca el código bueno: %s", (_nombre, fuente) => {
    expect(lecturasPorLote(fuente)).toHaveLength(0);
  });

  // LÍMITES CONOCIDOS. Lo que una regex no ve, dicho y fijado: cada caso es una lectura por lote real que el detector
  // deja pasar HOY. Si alguien lo ensancha, estos casos caen y el cambio de 0 a 1 se hace A SABIENDAS, no por accidente.
  const LIMITES_CONOCIDOS: Array<[string, string]> = [
    ["where armado en una variable aparte", "const donde = { lotId }; await prisma.lotProcess.findFirst({ where: donde })"],
    ["los argumentos enteros en una variable", "const args = { where: { lotId } }; await prisma.lotProcess.findFirst(args)"],
    ["el cliente por un alias", "const lp = prisma.lotProcess; await lp.findFirst({ where: { lotId } })"],
    ["SQL crudo sobre la tabla", "await prisma.$queryRaw`select * from traceability.lot_process where lot_id = ${lotId}`"],
    ["la lista de ids de las corridas", "prisma.lotProcess.findMany({ where: { id: { in: corridas.map((c) => c.lotProcessId) } } })"],
    ["la clave de la corrida con un valor que no es literal", "prisma.fermentationRun.findMany({ where: { lotProcess: filtroDeProceso } })"],
  ];
  it.each(LIMITES_CONOCIDOS)("límite conocido, no lo ve: %s", (_nombre, fuente) => {
    expect(lecturasPorLote(fuente)).toHaveLength(0);
  });

  // Ronda de arreglo 1: `/*` o `//` DENTRO de una cadena no abre un comentario. Con el quitacomentarios viejo, una lectura
  // por lote escrita después de un `accept="image/*"` quedaba escondida hasta el siguiente `*/`.
  const LECTURA = "await prisma.lotProcess.findFirst({ where: { lotId } });";
  const DESPUES_DE_UNA_CADENA: Array<[string, string]> = [
    ["comillas dobles, JSX con accept=image/*", `const a = <input type="file" accept="image/*" />;\n${LECTURA}\n/** fin */`],
    ["comillas simples", `const a = '/*'; ${LECTURA} /* fin */`],
    ["plantilla", "const a = `/* ${x}`; " + LECTURA + " /* fin */"],
    ["// dentro de una cadena", `const url = "a // b"; ${LECTURA}`],
  ];
  it.each(DESPUES_DE_UNA_CADENA)("el quitacomentarios salta las cadenas: %s", (_nombre, fuente) => {
    expect(lecturasPorLote(fuente)).toHaveLength(1);
  });
  it("`://` fuera de una cadena (el texto de un JSX) no abre un comentario", () => {
    expect(lecturasPorLote(`const a = <a>https://x.dev</a>; ${LECTURA}`)).toHaveLength(1);
  });
  it("y sigue quitando los comentarios de verdad, también tras una cadena con apóstrofo", () => {
    expect(lecturasPorLote(`/* lotProcesses: { take: 1 } */ const x = 1;`)).toHaveLength(0);
    expect(lecturasPorLote(`const s = "it's"; // lotProcesses: { take: 1 }`)).toHaveLength(0);
    expect(lecturasPorLote(`const s = "it's"; /* lotProcesses: { take: 1 } */ ${LECTURA}`)).toHaveLength(1);
  });

  it("el detector de listarProcesosDeLote ve la llamada, la importación y el alias, y no el comentario", () => {
    expect(usaListarProcesosDeLote("const p = await listarProcesosDeLote(user.userAccountId, id);")).toBe(true);
    expect(usaListarProcesosDeLote('import { listarProcesosDeLote } from "../traceability/lotProcess";')).toBe(true);
    expect(usaListarProcesosDeLote("const lista = lotProcessModulo.listarProcesosDeLote;")).toBe(true);
    expect(usaListarProcesosDeLote("// la lee `listarProcesosDeLote(user, id)`")).toBe(false);
    expect(usaListarProcesosDeLote("type Fila = ProcesoDeLote;")).toBe(false);
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

  it("nadie fuera de lotProcess.ts usa listarProcesosDeLote: la excepción exime al archivo que la define, no a quien la llama", () => {
    const quienLaDefine = "lib/traceability/lotProcess.ts";
    // control positivo: si la función se renombra, esta prueba queda ciega, y «nadie la usa» se leería igual que «no miré»
    expect(usaListarProcesosDeLote(readFileSync(join(RAIZ, quienLaDefine), "utf8")), `${quienLaDefine} ya no define listarProcesosDeLote`).toBe(true);
    const culpables = [...fuentes(join(RAIZ, "lib")), ...fuentes(join(RAIZ, "app"))]
      .filter((f) => f !== quienLaDefine)
      .filter((f) => usaListarProcesosDeLote(readFileSync(join(RAIZ, f), "utf8")));
    expect(culpables, `usan listarProcesosDeLote, que es excepción de ${quienLaDefine} y no de quien la llama: ${culpables.join(", ")}`).toEqual([]);
  });
});
