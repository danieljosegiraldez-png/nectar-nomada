/**
 * Las tres cifras de la densidad, cada una con su procedencia (§8 del diseño, D10).
 *
 * **Por qué no sale de `areaHectares`** (decisión de Daniel, 2026-10-02): «la densidad
 * se coloca por mts entre cada plantón, y hay tantos plantones». En un lote irregular el
 * área del polígono incluye la roca y el camino, así que la densidad real saldría baja
 * por una razón que no es agronómica. El área se deriva de la rejilla: celdas × el marco.
 *
 * Hermética: aritmética, sin base. Carril de `scripts/ci.sh`.
 */
import { describe, expect, it } from "vitest";
import {
  areaPlantadaHectareas,
  densidadDelLote,
  densidadDisenada,
} from "../../lib/traceability/densidadPorMarco";

/** El marco que el propio esquema nombra: «La Pink Bourbon es 1,8 × 2,5». */
const PINK_BOURBON = { plantSpacingMeters: 1.8, rowSpacingMeters: 2.5 };

describe("densidadDisenada", () => {
  it("el marco de la Pink Bourbon da 2.222 plantas por hectárea", () => {
    expect(densidadDisenada(PINK_BOURBON)).toBe(2222);
  });

  /**
   * **El control que TIENE que salir distinto.** Si un marco distinto diera el mismo
   * número, la función no estaría usando sus argumentos y la prueba de arriba no mediría.
   */
  it("un marco distinto da un número distinto", () => {
    expect(densidadDisenada({ plantSpacingMeters: 1, rowSpacingMeters: 2 })).toBe(5000);
  });

  it("sin uno de los dos metros no hay densidad diseñada: null, nunca cero", () => {
    expect(densidadDisenada({ plantSpacingMeters: 1.8, rowSpacingMeters: null })).toBeNull();
    expect(densidadDisenada({ plantSpacingMeters: null, rowSpacingMeters: 2.5 })).toBeNull();
    expect(densidadDisenada({ plantSpacingMeters: null, rowSpacingMeters: null })).toBeNull();
  });

  /** Un cero o un negativo no dan una densidad infinita: dan «no se sabe». */
  it("un metro de cero o negativo da null, no una densidad infinita", () => {
    expect(densidadDisenada({ plantSpacingMeters: 0, rowSpacingMeters: 2.5 })).toBeNull();
    expect(densidadDisenada({ plantSpacingMeters: -1, rowSpacingMeters: 2.5 })).toBeNull();
    expect(densidadDisenada({ plantSpacingMeters: 1.8, rowSpacingMeters: 0 })).toBeNull();
  });

  /** Y un `NaN`, que compara falso contra todo y por eso hay que afirmarlo antes. */
  it("un NaN da null", () => {
    expect(densidadDisenada({ plantSpacingMeters: Number.NaN, rowSpacingMeters: 2.5 })).toBeNull();
  });
});

describe("areaPlantadaHectareas", () => {
  it("las 176 celdas del lote con la esquina cortada dan 0,0792 ha", () => {
    expect(areaPlantadaHectareas(176, PINK_BOURBON)).toBeCloseTo(0.0792, 4);
  });

  it("sin celdas no hay área: null, no cero", () => {
    expect(areaPlantadaHectareas(0, PINK_BOURBON)).toBeNull();
  });

  it("sin marco no hay área", () => {
    expect(areaPlantadaHectareas(176, { plantSpacingMeters: null, rowSpacingMeters: 2.5 })).toBeNull();
  });
});

describe("densidadDelLote", () => {
  it("con todo puesto da las tres cifras, y la real por debajo de la diseñada", () => {
    const d = densidadDelLote({
      marco: PINK_BOURBON,
      celdasPlantadas: 176,
      plantasContadas: 150,
      cohortesSinConteo: 0,
    });
    expect(d).toMatchObject({ status: "ok", disenada: 2222, celdas: 176 });
    // **El estrechamiento no es adorno:** sin él, un cambio de `status` dejaría las
    // aserciones de abajo sin ejecutarse y la prueba pasaría vacía.
    if (d.status !== "ok") throw new Error("el status cambió: lo de abajo no mediría");
    expect(d.real).toBeCloseTo(1894, 0);
    expect(d.areaHectareas).toBeCloseTo(0.0792, 4);
    expect(d.real, "150 en 176 celdas es menos densidad que el marco").toBeLessThan(d.disenada);
  });

  it("una siembra sin conteo bloquea la densidad real, y lo dice", () => {
    const d = densidadDelLote({
      marco: PINK_BOURBON,
      celdasPlantadas: 176,
      plantasContadas: 70,
      cohortesSinConteo: 2,
    });
    expect(d).toMatchObject({ status: "conteo_incompleto", cohortesSinConteo: 2 });
    expect(d, "una densidad sobre un conteo incompleto es un número que parece cierto")
      .not.toHaveProperty("real");
  });

  /** Sin forma no hay área derivada — pero el marco sí da la diseñada, que no depende de ella. */
  it("sin forma declarada no hay área ni densidad real, pero SÍ la diseñada", () => {
    const d = densidadDelLote({
      marco: PINK_BOURBON,
      celdasPlantadas: 0,
      plantasContadas: 150,
      cohortesSinConteo: 0,
    });
    expect(d).toMatchObject({ status: "sin_forma", disenada: 2222 });
    expect(d).not.toHaveProperty("real");
    expect(d).not.toHaveProperty("areaHectareas");
  });

  it("sin marco no hay ninguna de las tres", () => {
    const d = densidadDelLote({
      marco: { plantSpacingMeters: null, rowSpacingMeters: null },
      celdasPlantadas: 176,
      plantasContadas: 150,
      cohortesSinConteo: 0,
    });
    expect(d).toEqual({ status: "sin_marco" });
  });

  /**
   * **El orden importa: sin marco gana sobre sin forma.** Sin los dos metros no hay
   * ninguna cifra que dar, ni siquiera la diseñada, así que decir `sin_forma` ahí
   * prometería una diseñada que no existe.
   */
  it("sin marco Y sin forma dice sin_marco, no sin_forma", () => {
    const d = densidadDelLote({
      marco: { plantSpacingMeters: null, rowSpacingMeters: null },
      celdasPlantadas: 0,
      plantasContadas: 0,
      cohortesSinConteo: 0,
    });
    expect(d.status).toBe("sin_marco");
  });
});
