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

for (const rel of ARCHIVOS) {
  const src = sinComentarios(readFileSync(join(RAIZ, rel), "utf8"));
  for (const m of src.matchAll(/entityType:\s*"([^"]+)"/g)) {
    const antes = src.slice(Math.max(0, m.index - 400), m.index);
    // Una LECTURA nombra la tabla o el lector genérico; una ESCRITURA nombra
    // `recordAuditEvent`. `leerEnmiendas` entró aquí el mismo día que el
    // guardia: al arreglar `lots.ts` la consulta se movió dentro de él y el
    // control positivo se puso rojo diciendo «no estoy mirando nada», que era
    // literalmente cierto. Un guardia que se queda sin sujeto tiene que
    // decirlo, no pasar.
    if (/(auditEvent\.(findMany|findFirst|count|groupBy)|leerEnmiendas)\s*\(/.test(antes)) {
      LEIDOS.push({ archivo: rel, valor: m[1]! });
    } else ESCRITOS.add(m[1]!);
  }
}

describe("el vocabulario de `entityType` es uno solo", () => {
  it("el análisis encuentra escrituras y lecturas de verdad", () => {
    // Control positivo: sin esto, un cambio que rompiera la detección dejaría
    // la comprobación de abajo pasando sobre conjuntos vacíos.
    expect(ESCRITOS.size, "no se detectó ninguna escritura de entityType").toBeGreaterThan(20);
    expect(LEIDOS.length, "no se detectó ninguna lectura: el guardia no está mirando").toBeGreaterThan(0);
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
