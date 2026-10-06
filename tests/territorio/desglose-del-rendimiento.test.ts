import { describe, expect, it } from "vitest";

import { desgloseDeRendimiento } from "../../lib/traceability/plantingCohorts";

/**
 * **ADR-196 §4: un total no es una medición si no se puede desarmar.** El
 * rendimiento del lote incluye el de sus selecciones, así que tiene que decir
 * cuánto es propio y cuánto viene de cada una, con su nombre.
 *
 * Este archivo es **hermético a propósito**: la función es pura, no toca la base,
 * y por eso NO se declara en `scripts/pruebas-por-compuerta.txt`. `computePlotYield`
 * se queda intacta —también pura, con sus propias pruebas— porque meterle el
 * origen sería cambiarla para dos cosas a la vez.
 */

const madre = "11111111-1111-1111-1111-111111111111";
const hija = "22222222-2222-2222-2222-222222222222";
const otra = "33333333-3333-3333-3333-333333333333";

describe("desgloseDeRendimiento", () => {
  it("separa lo propio de lo de cada selección, y suma por origen", () => {
    const d = desgloseDeRendimiento(
      [
        { locationId: madre, cherryWeightKg: 100, location: { name: "La madre" } },
        { locationId: hija, cherryWeightKg: 40, location: { name: "La hija" } },
        { locationId: hija, cherryWeightKg: 2, location: { name: "La hija" } },
      ],
      madre,
    );

    expect(d.propio).toBe(100);
    expect(d.porSeleccion).toEqual([{ locationId: hija, nombre: "La hija", cherryWeightKg: 42 }]);
  });

  it("un aporte sin pesar cuenta 0 kg en una selección que SÍ aparece", () => {
    const d = desgloseDeRendimiento(
      [{ locationId: hija, cherryWeightKg: null, location: { name: "La hija" } }],
      madre,
    );

    // **CONTROL POSITIVO de la aserción de arriba:** la selección aparece con 0 kg
    // pesados, que es distinto de NO aparecer. Sin esta mitad, un desglose que
    // filtrara los nulos pasaría igual — y una selección con cosechas sin pesar
    // existe (ADR-080: sin registrar y cero son hechos distintos).
    expect(d.porSeleccion).toEqual([{ locationId: hija, nombre: "La hija", cherryWeightKg: 0 }]);
    expect(d.propio).toBe(0);
  });

  it("varias selecciones salen cada una por su lado, no fundidas", () => {
    const d = desgloseDeRendimiento(
      [
        { locationId: hija, cherryWeightKg: 10, location: { name: "La hija" } },
        { locationId: otra, cherryWeightKg: 5, location: { name: "La otra" } },
      ],
      madre,
    );

    expect(d.propio).toBe(0);
    expect(d.porSeleccion).toHaveLength(2);
    expect(d.porSeleccion.map((s) => s.cherryWeightKg).sort((a, b) => a - b)).toEqual([5, 10]);
  });
});
