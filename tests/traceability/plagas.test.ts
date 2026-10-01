import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PLAGAS, esPlaga } from "../../lib/traceability/plagas";

/**
 * `PLAGAS` y el enum `PlotInterventionTarget` tienen que crecer JUNTOS.
 *
 * Desde el 2026-09-30 esa lista la leen dos sitios —el formulario de intervención, que elige el
 * objetivo, y el alta de producto, que declara qué cubre—. El día que se añada una plaga al enum y
 * no a la lista, la pantalla del producto no podría declararla y la intervención sí podría
 * apuntarle: quedaría un objetivo que ningún producto puede cubrir, y **nada fallaría en rojo**.
 *
 * **Se lee `prisma/schema.prisma`, no el cliente generado.** El cliente puede estar viejo respecto
 * al esquema —pasa en esta casa cada vez que se trae una migración sin regenerar— y entonces las
 * dos mitades de la comparación saldrían de la misma foto desfasada: el guardia diría que sí
 * casan justo cuando lo que hay que detectar es que el esquema cambió.
 */
function valoresDelEnum(nombre: string): string[] {
  const esquema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  const bloque = new RegExp(`\\benum\\s+${nombre}\\s*\\{([^}]*)\\}`).exec(esquema);
  if (!bloque) throw new Error(`No hay ningún enum ${nombre} en prisma/schema.prisma`);
  return bloque[1]!
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter((l) => l !== "" && !l.startsWith("@@"));
}

describe("las plagas que la casa reconoce", () => {
  it("el lector del esquema encuentra algo — sin esto, un cero se leería como «casan»", () => {
    // Control positivo del INSTRUMENTO, no del dato: si el regex dejara de casar devolvería una
    // lista vacía, y una lista vacía es subconjunto de cualquier cosa. La aserción de abajo
    // pasaría sin haber mirado nada.
    expect(valoresDelEnum("PlotInterventionTarget").length).toBeGreaterThan(5);
  });

  it("PLAGAS es exactamente el enum del esquema, ni una de más ni una de menos", () => {
    expect([...PLAGAS].sort()).toEqual([...valoresDelEnum("PlotInterventionTarget")].sort());
  });

  it("no acepta cualquier cadena que llegue de un formulario", () => {
    expect(esPlaga("broca")).toBe(true);
    expect(esPlaga("BROCA")).toBe(false);
    expect(esPlaga("lo-que-sea")).toBe(false);
    expect(esPlaga(undefined)).toBe(false);
    expect(esPlaga(null)).toBe(false);
    expect(esPlaga(7)).toBe(false);
  });
});
