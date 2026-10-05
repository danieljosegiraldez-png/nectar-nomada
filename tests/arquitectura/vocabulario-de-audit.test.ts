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
 * El mismo texto con los COMENTARIOS en blanco, conservando cada posición.
 *
 * **Hizo falta el mismo día que este guardia.** Su primera versión encontró el
 * defecto de `lots.ts` y falló bien. Después se escribió `enmiendas.ts`, cuya
 * cabecera **cita** el defecto —«consultaba `entityType: "Lot"`»— y el
 * analizador contó esa cita como una escritura: el guardia se puso verde con el
 * código roto delante. Un guardia al que la prosa que lo explica lo desarma no
 * es un guardia, y es la segunda vez que este repositorio lo aprende: la
 * primera fue un `});` dentro de un comentario cerrando una transacción.
 *
 * Las CADENAS no se blanquean: los literales son justo el dato que se mide.
 */
function sinComentarios(src: string): string {
  const salida = src.split("");
  let estado: "codigo" | "linea" | "bloque" | "comilla" | "doble" | "plantilla" = "codigo";
  const blanquear = (i: number) => {
    if (salida[i] !== "\n") salida[i] = " ";
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const sig = src[i + 1];
    if (estado === "codigo") {
      if (c === "/" && sig === "/") { estado = "linea"; blanquear(i); blanquear(i + 1); i++; }
      else if (c === "/" && sig === "*") { estado = "bloque"; blanquear(i); blanquear(i + 1); i++; }
      else if (c === "'") estado = "comilla";
      else if (c === '"') estado = "doble";
      else if (c === "`") estado = "plantilla";
      continue;
    }
    if (estado === "linea") { if (c === "\n") estado = "codigo"; else blanquear(i); continue; }
    if (estado === "bloque") { blanquear(i); if (c === "*" && sig === "/") { blanquear(i + 1); i++; estado = "codigo"; } continue; }
    // Dentro de una cadena: se conserva, pero `\\` se salta el siguiente.
    if (c === "\\") { i++; continue; }
    if ((estado === "comilla" && c === "'") || (estado === "doble" && c === '"') || (estado === "plantilla" && c === "`")) estado = "codigo";
  }
  return salida.join("");
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
function tramosDeLector(src: string): Array<[number, number]> {
  const tramos: Array<[number, number]> = [];
  for (const m of src.matchAll(LECTOR)) {
    let i = m.index + m[0].length; // justo tras el `(`
    let profundidad = 1;
    while (i < src.length && profundidad > 0) {
      if (src[i] === "(") profundidad++;
      else if (src[i] === ")") profundidad--;
      i++;
    }
    tramos.push([m.index, i]);
  }
  return tramos;
}

/** Cuántos tramos de lector encontró el análisis: su propio control positivo. */
let TRAMOS_DE_LECTOR = 0;

for (const rel of ARCHIVOS) {
  const src = sinComentarios(readFileSync(join(RAIZ, rel), "utf8"));
  const tramos = tramosDeLector(src);
  TRAMOS_DE_LECTOR += tramos.length;
  for (const m of src.matchAll(/entityType:\s*"([^"]+)"/g)) {
    const dentroDeUnLector = tramos.some(([a, b]) => m.index > a && m.index < b);
    if (dentroDeUnLector) LEIDOS.push({ archivo: rel, valor: m[1]! });
    else ESCRITOS.add(m[1]!);
  }
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
