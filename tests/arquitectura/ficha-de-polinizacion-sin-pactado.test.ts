/**
 * La ficha de polinización no dice que hay un pacto donde no lo hay.
 *
 * **La decisión.** ADR-200 §6, preguntas 23 a 25 (Daniel, 2026-10-12): en Kiva, el 4–6 colmenas/ha es
 * la **meta de trabajo que propuso Néctar** (informe del 2026-06-29, por analogía y sin ensayo en
 * Robusta), **no algo pactado**. Las hectáreas son el **área de los lotes**, y «faltan N» no se lee como
 * incumplimiento.
 *
 * **El defecto.** Hasta el 2026-10-14 la ficha decía «17 ha comprometidas» y «objetivo 4-6
 * colmenas/ha», y el tablero, que la densidad «necesita las hectáreas comprometidas». Ningún documento
 * primario respalda ese compromiso.
 *
 * Hermética: lee `messages/es.json` y `messages/en.json`. Mira las claves de la ficha y del tablero que
 * hablan de polinización, no todo el archivo: «contrato» es una palabra legítima en otros sitios.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const IDIOMAS = ["es", "en"] as const;
const leer = (idioma: (typeof IDIOMAS)[number]) =>
  JSON.parse(readFileSync(join(process.cwd(), `messages/${idioma}.json`), "utf8")).Apiary as Record<string, string>;

/** Las claves de la polinización en la ficha del apiario y en el tablero de sitios. */
const deLaPolinizacion = (m: Record<string, string>) =>
  Object.entries(m).filter(([k]) => k.startsWith("pollination") || k === "vitalesPendientes");

describe("la ficha de polinización dice «meta de trabajo», no «pacto»", () => {
  it("el lector encuentra las claves que se sabe que están", () => {
    // Fila patrón: un espacio de nombres mal leído daría cero claves, y los `not` de abajo pasarían
    // sin haber mirado nada.
    for (const idioma of IDIOMAS) {
      const claves = deLaPolinizacion(leer(idioma)).map(([k]) => k);
      expect(claves, idioma).toEqual(expect.arrayContaining(["pollinationHectares", "pollinationTarget", "vitalesPendientes"]));
    }
  });

  it("ninguna habla de hectáreas comprometidas ni de contrato", () => {
    for (const idioma of IDIOMAS) {
      for (const [clave, texto] of deLaPolinizacion(leer(idioma))) {
        expect(texto, `${idioma}.${clave}`).not.toMatch(/comprometid|committed|contrat|contract/i);
      }
    }
  });

  it("y si nombra el pacto es para negarlo: «no pactada», «not agreed»", () => {
    for (const idioma of IDIOMAS) {
      for (const [clave, texto] of deLaPolinizacion(leer(idioma))) {
        const sinNegacion = texto.replace(/no pactad[ao]s?/gi, "").replace(/not agreed/gi, "");
        expect(sinNegacion, `${idioma}.${clave}`).not.toMatch(/pactad|agreed/i);
      }
    }
  });

  it("la meta se rotula como tal, y las hectáreas como el área de los lotes", () => {
    const es = leer("es");
    const en = leer("en");
    expect(es.pollinationTarget).toMatch(/meta de trabajo/);
    expect(es.pollinationTarget).toMatch(/no pactada/);
    expect(en.pollinationTarget).toMatch(/working goal/);
    expect(en.pollinationTarget).toMatch(/not agreed/);
    expect(es.pollinationHectares).toMatch(/área de los lotes/);
    expect(en.pollinationHectares).toMatch(/lot area/i);
  });
});
