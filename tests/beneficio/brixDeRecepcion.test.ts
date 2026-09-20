/**
 * El Brix de la cereza al recibirla — spec recepción §3.5, plan Tarea 2. Hermética.
 */
import { describe, expect, it } from "vitest";
import { evaluarBrixDeRecepcion } from "../../lib/beneficio/brixDeRecepcion";

describe("el Brix de recepción", () => {
  it("18 y 24 son la entrada óptima", () => {
    expect(evaluarBrixDeRecepcion(18)).toBe("INTAKE_OPTIMAL");
    expect(evaluarBrixDeRecepcion(24)).toBe("INTAKE_OPTIMAL");
  });

  it("por debajo de 16 es inmadura", () => {
    expect(evaluarBrixDeRecepcion(15.9)).toBe("INTAKE_UNDERRIPE");
  });

  it("el tramo que la norma no cubre sale sin veredicto, no con uno inventado", () => {
    for (const bx of [16, 17, 25, 32]) expect(evaluarBrixDeRecepcion(bx)).toBe("SIN_VEREDICTO");
  });

  it("fuera del rango físico, y NaN, es SENSOR_FAULT", () => {
    for (const bx of [-1, 0, 32.1, Number.NaN]) expect(evaluarBrixDeRecepcion(bx)).toBe("SENSOR_FAULT");
  });
});
