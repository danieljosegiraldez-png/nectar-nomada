import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Todo `entityType` que se LEE existe entre los que se ESCRIBEN.
 *
 * **El defecto que lo motiva, medido el 2026-09-07**
 * (`PENDING_IMPLEMENTATIONS/009`). `lib/traceability/lots.ts` consultaba
 * `AuditEvent` con `entityType: "Lot"` y **nada escribe nunca esa cadena**: las
 * escrituras usan `snake_case` sin excepción. El panel «Historial» de un lote
 * renderizaba siempre vacío y afirmaba «este lote no tiene historial» — una
 * afirmación sobre el lote hecha por una consulta que no puede acertar nunca.
 *
 * Peor: el comentario de al lado lo certificaba como correcto, y era cierto
 * cuando se escribió. La instrumentación se construyó después y la consulta se
 * quedó atrás. **Una instrucción vieja es peor que ninguna.**
 *
 * **Por qué un guardia y no un arreglo.** Arreglar la consulta no impide la
 * siguiente: quien escriba el próximo lector volverá a inventarse una cadena, y
 * el fallo se lee igual que «no hubo cambios». Esto lo convierte en rojo.
 *
 * **Su límite, dicho:** compara cadenas literales. Un `entityType` compuesto en
 * tiempo de ejecución no lo vería. Hoy no hay ninguno —se comprueba abajo— y si
 * lo hubiera, este guardia se amplía por ahí.
 *
 * **CORREGIDO EL 2026-10-05: la clasificación miraba una VENTANA de 400
 * caracteres y eso le hacía perder lecturas reales, calladamente.** Al arreglar
 * `getLotDetail` su llamada a `leerEnmiendas` pasó a tener seis sujetos, y el
 * sexto —`lot_roast_profile`— cae a más de 400 caracteres de la llamada: el
 * detector lo contaba como ESCRITURA. Medido sobre el mismo árbol: la ventana
 * daba **8** lecturas y contar paréntesis da **9**, con las 6 de `lots.ts`.
 *
 * **Y se probó un método intermedio que falla al otro lado, por eso no es el que
 * quedó.** «Gana el marcador más cercano» daba **10**: la décima era
 * `consolidar-persona-duplicada.ts:374`, que es un `tx.auditEvent.create` —una
 * ESCRITURA— contada como lectura porque la última llamada a un lector quedaba
 * antes. O sea: la ventana tiene falsos negativos y la cercanía falsos positivos.
 * Contar paréntesis no tiene ninguno de los dos, porque pregunta lo que de verdad
 * importa: si el literal está DENTRO de los argumentos del lector.
 *
 * Control negativo del método que quedó: `quantity.ts`, que sólo escribe, da
 * **0** lecturas.
 *
 * **Por qué importa más que las dos líneas que perdía:** una lectura mal
 * clasificada entra en `ESCRITOS`, así que el guardia deja de vigilarla **y
 * además se vuelve más permisivo con las demás**. Y no falla en rojo: el
 * control positivo de abajo pedía «más de 0 lecturas» y se cumplía con 5 de 6.
 * Hoy el control exige que **cada archivo que llama a un lector aporte al menos
 * una lectura**, descubriendo los archivos en vez de enumerarlos — si la
 * clasificación vuelve a perder un literal de un archivo entero, cae.
 */
const RAIZ = new URL("../..", import.meta.url).pathname;

function fuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta));
    else if (entrada.endsWith(".ts") || entrada.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

const ARCHIVOS = ["lib", "app", "scripts"].flatMap((d) => fuentes(join(RAIZ, d))).map((r) => relative(RAIZ, r));

/** `entityType: "x"` dentro de una llamada a `recordAuditEvent` es una ESCRITURA. */
const ESCRITOS = new Set<string>();
/** `entityType: "x"` dentro de una consulta a `auditEvent` es una LECTURA. */
const LEIDOS: Array<{ archivo: string; valor: string }> = [];

/**
 * DOS vistas del mismo texto, de un solo recorrido y con las posiciones
 * alineadas carácter a carácter, para que un índice valga en las dos.
 *
 * - `conCadenas`: los COMENTARIOS en blanco y las cadenas **intactas**. Es
 *   donde se buscan los `entityType: "x"`, porque el literal ES el dato.
 * - `soloEstructura`: además, el CONTENIDO de cadenas, plantillas y expresiones
 *   regulares en blanco, conservando las comillas. Es donde se cuentan los
 *   paréntesis.
 *
 * **Blanquear los comentarios hizo falta el mismo día que este guardia.** Su
 * primera versión encontró el defecto de `lots.ts` y falló bien. Después se
 * escribió `enmiendas.ts`, cuya cabecera **cita** el defecto —«consultaba
 * `entityType: "Lot"`»— y el analizador contó esa cita como una escritura: el
 * guardia se puso verde con el código roto delante.
 *
 * **Y la segunda vista la pidió la revisión de Codex del 2026-10-05, sobre este
 * mismo archivo.** La versión anterior contaba cada `(` y `)` sin distinguir
 * código de cadenas, así que un `reason: ")"` dentro de un lector **cerraba el
 * tramo antes de tiempo** y su `entityType` pasaba al lado de las escrituras:
 * el guardia dejaba de denunciar esa lectura huérfana y seguía verde. Y un
 * `"("` extiende el tramo sobre escrituras posteriores y las cuenta como
 * lecturas. Los dos casos están abajo como prueba del analizador.
 *
 * **El límite que queda, dicho porque la cabecera anterior afirmaba de más:**
 * reconocer una expresión regular de una división es una HEURÍSTICA —se mira el
 * último carácter significativo— y no hay forma léxica de acertar siempre. Lo
 * que sí se garantiza es que los dos casos que Codex demostró están cubiertos y
 * tienen prueba. Decir «no tiene falsos positivos ni negativos», como decía
 * antes, era demasiado fuerte.
 */
export function vistasDelFuente(src: string): { conCadenas: string; soloEstructura: string } {
  const conCadenas = src.split("");
  const soloEstructura = src.split("");
  type Estado = "codigo" | "linea" | "bloque" | "comilla" | "doble" | "plantilla" | "regex";
  let estado: Estado = "codigo";
  /** El último carácter significativo de CÓDIGO: decide si un `/` abre regex o divide. */
  let previo = "";
  const blanquear = (arr: string[], i: number) => {
    if (arr[i] !== "\n") arr[i] = " ";
  };
  const ambas = (i: number) => {
    blanquear(conCadenas, i);
    blanquear(soloEstructura, i);
  };
  /** Tras uno de éstos, un `/` sólo puede abrir una expresión regular. */
  const ABRE_REGEX = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "~", "^", "<", ">", "\n"]);

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    const sig = src[i + 1];
    if (estado === "codigo") {
      if (c === "/" && sig === "/") { estado = "linea"; ambas(i); ambas(i + 1); i++; continue; }
      if (c === "/" && sig === "*") { estado = "bloque"; ambas(i); ambas(i + 1); i++; continue; }
      if (c === "/" && ABRE_REGEX.has(previo)) { estado = "regex"; continue; }
      if (c === "'") { estado = "comilla"; continue; }
      if (c === '"') { estado = "doble"; continue; }
      if (c === "`") { estado = "plantilla"; continue; }
      if (!/\s/.test(c)) previo = c;
      continue;
    }
    if (estado === "linea") { if (c === "\n") estado = "codigo"; else ambas(i); continue; }
    if (estado === "bloque") { ambas(i); if (c === "*" && sig === "/") { ambas(i + 1); i++; estado = "codigo"; } continue; }
    // Dentro de una cadena, plantilla o regex: `conCadenas` lo conserva,
    // `soloEstructura` lo borra. `\\` se salta el siguiente en las dos.
    if (c === "\\") { blanquear(soloEstructura, i); blanquear(soloEstructura, i + 1); i++; continue; }
    const cierra =
      (estado === "comilla" && c === "'") ||
      (estado === "doble" && c === '"') ||
      (estado === "plantilla" && c === "`") ||
      (estado === "regex" && c === "/");
    if (cierra) { estado = "codigo"; previo = c; continue; }
    blanquear(soloEstructura, i);
  }
  return { conCadenas: conCadenas.join(""), soloEstructura: soloEstructura.join("") };
}

/**
 * Una LECTURA nombra la tabla o el lector genérico. `leerEnmiendas` entró aquí
 * el mismo día que el guardia: al arreglar `lots.ts` la consulta se movió
 * dentro de él y el control positivo se puso rojo diciendo «no estoy mirando
 * nada», que era literalmente cierto. Un guardia que se queda sin sujeto tiene
 * que decirlo, no pasar.
 */
const LECTOR = /(?:auditEvent\.(?:findMany|findFirst|count|groupBy)|leerEnmiendas)\s*\(/g;

/**
 * El TRAMO de argumentos de cada llamada a un lector, **contando paréntesis
 * desde el `(`**, que no depende del formato ni de cuánto mida la llamada.
 *
 * La versión anterior miraba una ventana de 400 caracteres hacia atrás y por eso
 * perdía el sexto sujeto de un `leerEnmiendas` de seis; ver la cabecera. Es el
 * mismo error que ya costó un guardia de arquitectura en este repositorio —el de
 * la indentación en `plantingCohorts.ts`— y la misma respuesta: contar paréntesis.
 */
function tramosDeLector(conCadenas: string, soloEstructura: string): Array<[number, number]> {
  const tramos: Array<[number, number]> = [];
  for (const m of conCadenas.matchAll(LECTOR)) {
    let i = m.index + m[0].length; // justo tras el `(`
    let profundidad = 1;
    // Se cuenta sobre `soloEstructura`: un `)` dentro de una cadena no cierra.
    while (i < soloEstructura.length && profundidad > 0) {
      if (soloEstructura[i] === "(") profundidad++;
      else if (soloEstructura[i] === ")") profundidad--;
      i++;
    }
    tramos.push([m.index, i]);
  }
  return tramos;
}

/**
 * La clasificación, **exportada a propósito para poder darle entradas
 * hostiles**. Mientras vivía dentro del bucle sólo se podía probar a través del
 * árbol real, y el árbol real no contiene los casos que la rompen: así
 * sobrevivió el contador que se tragaba un `")"`. Es la misma incomodidad que
 * `CLAUDE.md` nombra — «el guardia es el que llama a la función con la entrada
 * hostil, lo que suele obligar a exportarla».
 */
export function clasificar(fuente: string): { leidos: string[]; escritos: string[]; tramos: number } {
  const { conCadenas, soloEstructura } = vistasDelFuente(fuente);
  const tramos = tramosDeLector(conCadenas, soloEstructura);
  const leidos: string[] = [];
  const escritos: string[] = [];
  for (const m of conCadenas.matchAll(/entityType:\s*"([^"]+)"/g)) {
    const dentro = tramos.some(([a, b]) => m.index > a && m.index < b);
    (dentro ? leidos : escritos).push(m[1]!);
  }
  return { leidos, escritos, tramos: tramos.length };
}

/** Cuántos tramos de lector encontró el análisis: su propio control positivo. */
let TRAMOS_DE_LECTOR = 0;

for (const rel of ARCHIVOS) {
  const { leidos, escritos, tramos } = clasificar(readFileSync(join(RAIZ, rel), "utf8"));
  TRAMOS_DE_LECTOR += tramos;
  for (const valor of leidos) LEIDOS.push({ archivo: rel, valor });
  for (const valor of escritos) ESCRITOS.add(valor);
}

describe("el vocabulario de `entityType` es uno solo", () => {
  it("el análisis encuentra escrituras y lecturas de verdad", () => {
    // Control positivo: sin esto, un cambio que rompiera la detección dejaría
    // la comprobación de abajo pasando sobre conjuntos vacíos.
    expect(ESCRITOS.size, "no se detectó ninguna escritura de entityType").toBeGreaterThan(20);
    expect(LEIDOS.length, "no se detectó ninguna lectura: el guardia no está mirando").toBeGreaterThan(0);
  });

  /**
   * **El control que la versión de la ventana no tenía.** Su único control era
   * «más de 0 lecturas», y eso se cumplía con 5 de 6: la que se perdía no hacía
   * ruido. Estas dos aserciones miden el ANÁLISIS, no el código.
   *
   * La segunda es la que discrimina de verdad, y es un control que **tiene que
   * salir distinto**: `quantity.ts` sólo escribe auditoría —ningún lector—, así
   * que si saliera con lecturas, la clasificación estaría marcando escrituras
   * como lecturas y el guardia sería un generador de falsos positivos. Un
   * detector que marcara todo como lectura pasaría la primera aserción y caería
   * en ésta.
   *
   * **Lo que NO se exige, y por qué:** que cada archivo con un lector aporte una
   * lectura. Se probó el 2026-10-05 y marcaba tres archivos correctos
   * —`enmiendas.ts`, `lib/apiary/bitacora.ts` y
   * `scripts/limpiar-audit-de-pruebas.ts`—, que son lectores que reciben el tipo
   * por parámetro o por constante y no llevan ningún literal. Abortar sobre
   * código correcto enseña a ignorar el guardia.
   */
  it("el análisis encuentra tramos de lector, y no confunde una escritura con uno", () => {
    expect(TRAMOS_DE_LECTOR, "no se encontró ni una llamada a un lector: el análisis no mide").toBeGreaterThan(0);
    // Control que tiene que salir DISTINTO: un archivo que sólo escribe.
    const enUnEscritorPuro = LEIDOS.filter((l) => l.archivo === "lib/traceability/quantity.ts");
    expect(
      enUnEscritorPuro.map((l) => l.valor),
      "`quantity.ts` sólo escribe auditoría: una lectura atribuida ahí significa que la clasificación " +
        "está metiendo escrituras en el lado de las lecturas, y entonces el guardia marca código correcto",
    ).toEqual([]);
  });

  it("todo `entityType` leído lo escribe alguien", () => {
    const huerfanos = LEIDOS.filter((l) => !ESCRITOS.has(l.valor)).map((l) => `${l.archivo}: "${l.valor}"`);
    expect(
      huerfanos,
      "esta consulta no puede acertar nunca: nadie escribe ese `entityType`, así que su pantalla " +
        "renderiza siempre vacía y eso se lee como «no hubo cambios». Usa el mismo vocabulario que la escritura.",
    ).toEqual([]);
  });
});

/**
 * **El analizador, probado con entradas hostiles en vez de sólo con el árbol.**
 *
 * Esto nace de la revisión de Codex del 2026-10-05, que demostró dos fallos del
 * contador de paréntesis **sin ejecutar nada**: el árbol real no contiene
 * ninguno de los dos casos, así que ningún control sobre `lib`, `app` y
 * `scripts` podía verlos. Es la lección de «una prueba que recorre datos reales
 * no vale como guardia de una transformación que esos datos no disparan»: vale
 * como red para el día que lleguen, y por eso los casos se escriben a mano.
 *
 * Cada caso dice **qué clasificación sería la equivocada**, para que no se lea
 * como una aserción cualquiera.
 */
describe("el analizador aguanta paréntesis dentro de literales", () => {
  it("control positivo: sin trampas, un lector normal se clasifica como lectura", () => {
    const { leidos, escritos } = clasificar(`
      prisma.auditEvent.findMany({ where: { entityType: "medicion" } });
      await recordAuditEvent({ entityType: "escritura_normal" });
    `);
    expect(leidos, "sin este caso en verde, los de abajo no prueban nada").toEqual(["medicion"]);
    expect(escritos).toEqual(["escritura_normal"]);
  });

  it("un `)` dentro de una CADENA no cierra el tramo del lector", () => {
    // El fallo que esto caza: el `)` cerraba el tramo antes del `entityType`, la
    // lectura se contaba como escritura, y el guardia dejaba de denunciarla.
    const { leidos, escritos } = clasificar(`
      prisma.auditEvent.findMany({ where: { reason: ")", entityType: "tipo_huerfano" } });
    `);
    expect(leidos, 'el `")"` cerró el tramo: esta lectura se está contando como escritura').toEqual(["tipo_huerfano"]);
    expect(escritos).toEqual([]);
  });

  it("un `(` dentro de una CADENA no extiende el tramo sobre una escritura posterior", () => {
    // El fallo simétrico: el tramo se alargaba y clasificaba como LECTURA un
    // `entityType` de una escritura que venía después.
    const { leidos, escritos } = clasificar(`
      prisma.auditEvent.findMany({ where: { reason: "(", entityType: "lectura" } });
      await recordAuditEvent({ entityType: "escritura_que_viene_despues" });
    `);
    expect(leidos).toEqual(["lectura"]);
    expect(escritos, 'el paréntesis abierto de la cadena alargó el tramo y se tragó la escritura siguiente').toEqual([
      "escritura_que_viene_despues",
    ]);
  });

  it("y tampoco los de una plantilla ni los de una expresión regular", () => {
    const conPlantilla = clasificar([
      "prisma.auditEvent.findMany({ where: { reason: `cerrado )`, entityType: \"desde_plantilla\" } });",
    ].join("\n"));
    expect(conPlantilla.leidos).toEqual(["desde_plantilla"]);

    const conRegex = clasificar(`
      const patron = /[)]/;
      prisma.auditEvent.findMany({ where: { entityType: "desde_regex" } });
    `);
    expect(conRegex.leidos).toEqual(["desde_regex"]);
  });

  it("un comentario que CITA un entityType no cuenta como ninguna de las dos cosas", () => {
    // El defecto original de este analizador: la cabecera de `enmiendas.ts`
    // cita `entityType: "Lot"` en prosa y se contaba como escritura.
    const { leidos, escritos } = clasificar(`
      // antes decía entityType: "Lot" y nadie lo escribía
      /* ni aquí: entityType: "TambienEnProsa" */
      await recordAuditEvent({ entityType: "el_unico_real" });
    `);
    expect([...leidos, ...escritos], "la prosa se está contando como código").toEqual(["el_unico_real"]);
  });
});
