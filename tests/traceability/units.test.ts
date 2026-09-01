/**
 * Phase 1, ticket T3 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §34). Pure function, no DB — the canonical unit registry itself.
 */
import { describe, expect, it } from "vitest";
import {
  listVariableDefinitions,
  normalizeToCanonical,
  UnitValidationError,
} from "../../lib/traceability/units";

describe("normalizeToCanonical", () => {
  it("passes a value through unchanged when the entry unit is already canonical", () => {
    const result = normalizeToCanonical("temperature", 25, "C");
    expect(result).toEqual({ value: 25, unit: "C" });
  });

  it("converts Fahrenheit to Celsius for temperature", () => {
    const result = normalizeToCanonical("temperature", 98.6, "F");
    expect(result.unit).toBe("C");
    expect(result.value).toBeCloseTo(37, 5);
  });

  it("validates each of the 7 measurement-matrix variables against their canonical unit", () => {
    expect(normalizeToCanonical("ph", 4.5, "pH")).toEqual({ value: 4.5, unit: "pH" });
    expect(normalizeToCanonical("brix", 20, "Bx")).toEqual({ value: 20, unit: "Bx" });
    expect(normalizeToCanonical("relative_humidity", 65, "%")).toEqual({ value: 65, unit: "%" });
    expect(normalizeToCanonical("moisture", 11, "%")).toEqual({ value: 11, unit: "%" });
    expect(normalizeToCanonical("water_activity", 0.6, "aw")).toEqual({ value: 0.6, unit: "aw" });
  });

  it("rejects an unsupported source unit", () => {
    expect(() => normalizeToCanonical("ph", 4.5, "F")).toThrow(UnitValidationError);
  });

  it("rejects an out-of-range value after conversion", () => {
    expect(() => normalizeToCanonical("temperature", 200, "C")).toThrow(UnitValidationError);
    expect(() => normalizeToCanonical("ph", 15, "pH")).toThrow(UnitValidationError);
    expect(() => normalizeToCanonical("water_activity", 1.5, "aw")).toThrow(UnitValidationError);
  });
});

describe("los dominios del registro (S1 §2)", () => {
  const proceso = listVariableDefinitions("proceso_de_cafe").map((v) => v.variable);
  const enmienda = listVariableDefinitions("analisis_de_enmienda").map((v) => v.variable);

  /**
   * El fallo que este bloque existe para impedir es silencioso y de interfaz:
   * `listVariableDefinitions` la consume el formulario de recetas de café como
   * desplegable, así que una variable de laboratorio añadida sin dominio
   * aparecería ahí a elegir como objetivo de proceso de un café. Nada falla;
   * simplemente la lista deja de tener sentido.
   */
  it("el análisis de laboratorio no se cuela en el desplegable de recetas de café", () => {
    for (const v of ["ash_content", "total_carbon", "carbon_nitrogen_ratio", "phosphorus", "boron"]) {
      expect(proceso, `${v} no debe ofrecerse como objetivo de proceso de un café`).not.toContain(v);
    }
  });

  it("y el proceso de café no se cuela en el análisis de enmienda", () => {
    for (const v of ["brix", "water_activity", "koji_propagation_duration", "vessel_pressure"]) {
      expect(enmienda, `${v} no es un parámetro de caracterización`).not.toContain(v);
    }
  });

  it("pH y humedad están en los dos, porque son la misma magnitud física", () => {
    // Lo que distingue «el pH de este biochar» de «el pH de este lote de café»
    // es el sujeto de la fila, no el nombre de la variable — el precedente que
    // units.ts ya cita para roastSessionId.
    for (const v of ["ph", "moisture"]) {
      expect(proceso).toContain(v);
      expect(enmienda).toContain(v);
    }
  });

  it("los dos dominios juntos cubren el registro entero", () => {
    // Sin esto, una variable nueva podría quedarse fuera de los dos y no
    // aparecer en ningún formulario, que es el fallo silencioso simétrico.
    const todas = new Set([...proceso, ...enmienda]);
    const registro = new Set([
      ...listVariableDefinitions("proceso_de_cafe").map((v) => v.variable),
      ...listVariableDefinitions("analisis_de_enmienda").map((v) => v.variable),
    ]);
    expect(todas.size).toBe(registro.size);
    expect(enmienda.length).toBeGreaterThan(0);
    expect(proceso.length).toBeGreaterThan(0);
  });
});

describe("las unidades de la Tabla 7", () => {
  it("convierte % a mg/kg exactamente — 1 % son 10.000 mg/kg", () => {
    // Es la conversión que un laboratorio obliga a hacer a mano si el sistema
    // no la hace, y es donde se cuelan los errores de dos órdenes de magnitud.
    expect(normalizeToCanonical("phosphorus", 0.35, "%")).toEqual({ value: 3500, unit: "mg/kg" });
    expect(normalizeToCanonical("potassium", 1, "%")).toEqual({ value: 10000, unit: "mg/kg" });
  });

  it("ppm y mg/kg son lo mismo y no se convierten", () => {
    expect(normalizeToCanonical("zinc", 180, "ppm")).toEqual({ value: 180, unit: "mg/kg" });
  });

  it("dS/m y mS/cm son la misma unidad", () => {
    expect(normalizeToCanonical("electrical_conductivity", 3.2, "mS/cm")).toEqual({
      value: 3.2,
      unit: "dS/m",
    });
  });

  it("acepta una relación C:N alta, que es justo el caso que hay que ver", () => {
    // Un char de madera sin cargar pasa de 300 con facilidad, y el marco
    // advierte que un C:N alto sin cargar puede inmovilizar nitrógeno.
    // Rechazarlo escondería lo que hay que mirar.
    expect(normalizeToCanonical("carbon_nitrogen_ratio", 320, "C:N")).toEqual({ value: 320, unit: "C:N" });
  });

  it("rechaza una unidad que no es de ese parámetro", () => {
    expect(() => normalizeToCanonical("ash_content", 12, "mg/kg")).toThrow(UnitValidationError);
  });
});
