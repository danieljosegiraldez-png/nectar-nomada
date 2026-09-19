/**
 * El color del año — spec 2026-09-18 §5.1. Hermética: función pura, sin base.
 *
 * El caso que la hace guardia de verdad es el de los DIEZ finales: un error de un lugar en el
 * módulo (año % 5 sin el desplazamiento) da blanco para 2025 y pasa en la mitad de los casos.
 */
import { describe, expect, it } from "vitest";
import { avisoDeCera, colorDelAño, UMBRALES_DE_CERA } from "../../lib/apiary/colorDelAno";

describe("el color del año, el código de las reinas", () => {
  it("cada final de año tiene su color, y se repite cada cinco", () => {
    const esperados: Record<number, string> = {
      2021: "blanco", 2026: "blanco",
      2022: "amarillo", 2027: "amarillo",
      2023: "rojo", 2028: "rojo",
      2024: "verde", 2029: "verde",
      2025: "azul", 2030: "azul",
    };
    for (const [año, color] of Object.entries(esperados)) expect([año, colorDelAño(Number(año))]).toEqual([año, color]);
    expect(colorDelAño(1996)).toBe("blanco");
    expect(colorDelAño(2000)).toBe("azul");
  });

  it("un año que no es un entero no tiene color", () => {
    expect(() => colorDelAño(2026.5)).toThrow(/año_invalido/);
    expect(() => colorDelAño(Number.NaN)).toThrow(/año_invalido/);
  });

  it("LOS AVISOS: nada antes de 2 años, revisar desde 2, renovar desde 4", () => {
    expect(UMBRALES_DE_CERA).toEqual({ revisar: 2, renovar: 4 });
    expect([0, 1, 2, 3, 4, 7].map(avisoDeCera)).toEqual([null, null, "revisar", "revisar", "renovar", "renovar"]);
  });
});
