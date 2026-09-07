/**
 * La suma directa, y sobre todo lo que rechaza.
 *
 * El caso que da sentido al archivo es el último de los válidos: los seis
 * criterios de la rúbrica de miel al máximo dan **exactamente 100**. Si algún
 * día alguien cambia un techo en el archivo del protocolo, esa prueba lo dice
 * antes de que un juez puntúe sobre 95 creyendo que puntúa sobre 100.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { puntajeSumaDeAtributos, PuntajeSumaInvalido } from "../../lib/sensory/puntajeSuma";
import { validarDefinicion } from "../../lib/sensory/definicionDeProtocolo";

const RAIZ = new URL("../..", import.meta.url).pathname;

function criteriosDeMiel() {
  const d = validarDefinicion(JSON.parse(readFileSync(`${RAIZ}protocolos/miel-competencia-100.json`, "utf8")));
  return d.attributes;
}

describe("puntajeSumaDeAtributos", () => {
  it("suma", () => {
    expect(
      puntajeSumaDeAtributos([
        { name: "A", scaleMin: 0, scaleMax: 20, value: 18 },
        { name: "B", scaleMin: 0, scaleMax: 10, value: 7.5 },
      ]),
    ).toBe(25.5);
  });

  it("la rúbrica de miel al máximo da exactamente 100", () => {
    const total = puntajeSumaDeAtributos(criteriosDeMiel().map((a) => ({ ...a, value: a.scaleMax })));
    expect(total).toBe(100);
  });

  it("la rúbrica de miel al mínimo da 0", () => {
    expect(puntajeSumaDeAtributos(criteriosDeMiel().map((a) => ({ ...a, value: a.scaleMin })))).toBe(0);
  });

  /**
   * Cada criterio tiene su propio techo —apariencia vale 10 y sabor 20—, así que
   * un rango global no serviría: un 20 en apariencia dobla su peso y el total
   * sigue pareciendo un número normal.
   */
  it("rechaza un valor por encima del techo de SU atributo, no del mayor", () => {
    const criterios = criteriosDeMiel().map((a) => ({ ...a, value: a.scaleMin }));
    const apariencia = criterios.findIndex((a) => a.name === "Apariencia");
    expect(apariencia, "el archivo de miel ya no trae el criterio Apariencia").toBeGreaterThanOrEqual(0);
    criterios[apariencia] = { ...criterios[apariencia]!, value: 20 };
    expect(() => puntajeSumaDeAtributos(criterios)).toThrow(/"Apariencia" vale 20; su escala va de 0 a 10/);
  });

  it("rechaza un negativo", () => {
    expect(() => puntajeSumaDeAtributos([{ name: "A", scaleMin: 0, scaleMax: 20, value: -1 }])).toThrow(
      PuntajeSumaInvalido,
    );
  });

  it("rechaza una lista vacía en vez de devolver 0", () => {
    // Un 0 aquí sería un puntaje perfecto de lo más bajo, indistinguible de
    // «no llegó ningún criterio».
    expect(() => puntajeSumaDeAtributos([])).toThrow(PuntajeSumaInvalido);
  });
});
