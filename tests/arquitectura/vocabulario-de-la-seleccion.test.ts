/**
 * El vocabulario de la selección no vuelve a enseñar lo contrario de la regla.
 *
 * **Qué caza, y la mutación de cada cosa (ADR-196, spec §3.3 y §5).**
 *  - el doc de `PlotBlock` cita el ADR → la mutación es restaurar el comentario viejo
 *  - la frase «ZONA, no una lista de plantas» no vuelve → misma mutación
 *  - `micro_plot` sigue muerto en producción → la mutación es escribirlo en `lib/` o `app/`
 *
 * **Por qué la lista de lecturas está declarada y no prohibida.** Seis sitios de `lib/` leen el
 * literal para aceptar una microparcela donde se acepta una parcela. Eso es correcto y tiene que
 * seguir pasando; lo que no puede volver es una ESCRITURA. Un guardia que prohibiese el literal
 * entero nacería rojo sobre código bueno, y eso enseña a esquivarlo.
 *
 * Hermético: lee archivos, no toca la base.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const ESQUEMA = readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8");

/**
 * Los sitios de producción que LEEN `micro_plot`, cada uno con su razón. Si aparece uno nuevo,
 * esta prueba cae y quien lo añadió decide si es lectura (va a la lista) o escritura (no va).
 */
const LECTURAS_DECLARADAS: ReadonlyMap<string, string> = new Map([
  ["lib/apiary/hives.ts", "acota el selector de sitios de abejas a site|plot|micro_plot"],
  ["lib/traceability/fincaTrampas.ts", "acota el where de trampas a plot|micro_plot, a propósito"],
  ["lib/traceability/fincas.ts", "acepta una microparcela donde acepta una parcela"],
  ["lib/traceability/floracion.ts", "idem, para la floración"],
  ["lib/traceability/intervenciones.ts", "idem, para una intervención"],
  ["lib/traceability/tiposDeBloque.ts", "sólo lo nombra en un comentario, para distinguirlo"],
]);

/** Todos los `.ts`/`.tsx` bajo una raíz, sin seguir a `node_modules` ni a `generated`. */
function fuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(join(RAIZ, dir))) {
    if (entrada === "node_modules" || entrada === "generated" || entrada.startsWith(".")) continue;
    const rel = `${dir}/${entrada}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) salida.push(...fuentes(rel));
    else if (rel.endsWith(".ts") || rel.endsWith(".tsx")) salida.push(rel);
  }
  return salida;
}

/** Una ESCRITURA es `locationType:` seguido del literal: lo que crea o actualiza una fila. */
const ESCRITURA = /locationType\s*:\s*["'`]micro_plot["'`]/;

describe("el vocabulario de la selección", () => {
  const archivos = [...fuentes("lib"), ...fuentes("app")];

  it("se leyó de verdad: hay centenares de fuentes y el esquema es grande", () => {
    // Fila patrón. Sin esto, una raíz mal escrita daría CERO escrituras de `micro_plot` y cero
    // frases prohibidas, que es exactamente el veredicto que este guardia busca. Un cero se lee
    // como «limpio» cuando significa «no miré».
    expect(archivos.length).toBeGreaterThan(200);
    expect(ESQUEMA.length).toBeGreaterThan(100_000);
  });

  it("el doc del bloque cita el ADR-196", () => {
    const i = ESQUEMA.indexOf("model PlotBlock ");
    expect(i, "no se encontró `model PlotBlock` en el esquema").toBeGreaterThan(0);
    // El doc `///` va inmediatamente encima del modelo: se mira la ventana anterior.
    const doc = ESQUEMA.slice(Math.max(0, i - 900), i);
    expect(doc).toContain("ADR-196");
  });

  it("la frase que decía lo contrario no vuelve", () => {
    expect(ESQUEMA).not.toContain("ZONA, no una lista de plantas");
  });

  it("`micro_plot` sigue declarado muerto donde vive", () => {
    expect(ESQUEMA).toContain("MUERTO (ADR-196)");
  });

  it("ninguna fuente de producción ESCRIBE micro_plot", () => {
    const culpables = archivos.filter((a) => ESCRITURA.test(readFileSync(join(RAIZ, a), "utf8")));
    expect(culpables).toEqual([]);
  });

  it("y el detector de escrituras funciona: reconoce una", () => {
    // Control positivo de la de arriba. Sin él, un regex roto daría la lista vacía sobre
    // cualquier árbol, y «ninguna escritura» significaría «no sé buscar escrituras».
    expect(ESCRITURA.test(`data: { locationType: "micro_plot" }`)).toBe(true);
    expect(ESCRITURA.test(`locationType: { in: ["plot", "micro_plot"] }`)).toBe(false);
  });

  it("los sitios que LEEN micro_plot son los declarados, ni uno más", () => {
    const leen = archivos.filter((a) => readFileSync(join(RAIZ, a), "utf8").includes("micro_plot"));
    const nuevos = leen.filter((a) => !LECTURAS_DECLARADAS.has(a));
    expect(
      nuevos,
      "sitio nuevo que nombra micro_plot: si lo LEE, decláralo con su razón; si lo ESCRIBE, no puede",
    ).toEqual([]);
  });

  it("y los declarados siguen ahí: si uno se va, sobra de la lista", () => {
    // Control positivo del de arriba. Sin él, borrar la comprobación dejaría la lista como un
    // adorno que no vigila nada.
    const leen = new Set(
      archivos.filter((a) => readFileSync(join(RAIZ, a), "utf8").includes("micro_plot")),
    );
    for (const [ruta, razon] of LECTURAS_DECLARADAS) {
      expect(leen.has(ruta), `${ruta} ya no nombra micro_plot (${razon}): quítalo de la lista`).toBe(
        true,
      );
    }
  });
});
