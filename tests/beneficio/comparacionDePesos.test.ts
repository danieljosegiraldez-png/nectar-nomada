/**
 * El neto de una recepción y la comparación de básculas — spec recepción §3.4, plan Tarea 2.
 * Hermética.
 */
import { describe, expect, it } from "vitest";
import { compararBasculas, netoDeRecepcion } from "../../lib/beneficio/comparacionDePesos";
import { POLITICA_POR_DEFECTO, SchemaError } from "../../lib/beneficio/balanceDeMasas";

describe("el neto", () => {
  it("bruto menos recipientes por tara, a 3 decimales", () => {
    expect(netoDeRecepcion(20, 2, 0.5)).toBe(19);
    expect(netoDeRecepcion(20, 0, 0)).toBe(20);
    expect(netoDeRecepcion(12.345, 3, 0.115)).toBe(12);
  });

  it("un neto que no queda positivo, o datos imposibles, lanzan", () => {
    expect(() => netoDeRecepcion(1, 2, 0.5)).toThrow(SchemaError);
    expect(() => netoDeRecepcion(0, 0, 0)).toThrow(SchemaError);
    expect(() => netoDeRecepcion(10, 1.5, 0.5)).toThrow(SchemaError);
    expect(() => netoDeRecepcion(10, 1, -0.1)).toThrow(SchemaError);
  });
});

describe("la comparación de básculas", () => {
  it("dentro del piso de 0,5 kg es BALANCED", () => {
    const c = compararBasculas(20, 19.9);
    expect(c.estado).toBe("BALANCED");
    expect(c.toleranciaKg).toBe(0.5);
    expect(c.diferenciaKg).toBe(-0.1);
  });

  it("fuera de tolerancia y dentro del 5 % es DISCREPANCY_FLAGGED", () => {
    const c = compararBasculas(200, 198);
    expect(c.toleranciaKg).toBe(1);
    expect(c.estado).toBe("DISCREPANCY_FLAGGED");
    expect(c.diferenciaPct).toBeCloseTo(-0.01, 10);
  });

  it("más del 5 % es GROSS_IMBALANCE", () => {
    expect(compararBasculas(100, 90).estado).toBe("GROSS_IMBALANCE");
  });

  it("el signo: más en el beneficio es diferencia positiva", () => {
    expect(compararBasculas(20, 20.6).diferenciaKg).toBe(0.6);
  });

  it("el caso de Codex: la base es la referencia, no el neto", () => {
    // Sobre la referencia (100) la tolerancia es 0,500 y 0,502 la supera; sobre el neto (100,502)
    // sería 0,50251 y pasaría. La regla es la referencia.
    const c = compararBasculas(100, 100.502);
    expect(c.toleranciaKg).toBe(0.5);
    expect(c.estado).toBe("DISCREPANCY_FLAGGED");
  });

  it("guarda la política con la que se calculó", () => {
    expect(compararBasculas(20, 20).politica).toEqual(POLITICA_POR_DEFECTO);
  });

  it("una referencia no positiva lanza", () => {
    expect(() => compararBasculas(0, 10)).toThrow(SchemaError);
  });
});
