// tests/equipos/modosDeInstrumento.test.ts
import { describe, it, expect } from "vitest";
import { modoEsperado, hayDesajuste, fueraDeRango } from "../../lib/equipos/modos";

const MODOS = [
  { id: "m1", label: "Parchment Coffee", materialState: "PARCHMENT", rangeMin: 8,  rangeMax: 38 },
  { id: "m2", label: "Green Coffee",     materialState: "GREEN",     rangeMin: 7,  rangeMax: 35 },
] as const;

describe("el modo del instrumento se elige por el material, no por la memoria", () => {
  it("propone el modo cuyo material coincide", () => {
    expect(modoEsperado("PARCHMENT", MODOS)?.label).toBe("Parchment Coffee");
  });

  it("devuelve null cuando el aparato no tiene modo para ese material", () => {
    // Un medidor de grano no tiene escala de cereza. Decirlo es más útil que
    // ofrecer una escala al azar.
    expect(modoEsperado("CHERRY", MODOS)).toBeNull();
  });

  it("detecta medir pergamino con el ajuste de verde", () => {
    expect(hayDesajuste(MODOS[1], "PARCHMENT")).toBe(true);
    // Control positivo: el caso correcto NO es desajuste.
    expect(hayDesajuste(MODOS[0], "PARCHMENT")).toBe(false);
  });

  it("sin modo declarado no afirma desajuste", () => {
    // «No sabemos en qué modo estaba» no es «estaba en el modo equivocado».
    expect(hayDesajuste(null, "PARCHMENT")).toBe(false);
  });
});

describe("límites y material desconocido", () => {
  it("sin material no afirma desajuste; con material distinto sí", () => {
    expect(hayDesajuste(MODOS[0], null)).toBe(false);
    expect(hayDesajuste(MODOS[0], "GREEN")).toBe(true);
  });

  it("busca entre todos los modos y no inventa uno para una lista vacía", () => {
    expect(modoEsperado("GREEN", MODOS)).toBe(MODOS[1]);
    expect(modoEsperado("PARCHMENT", [])).toBeNull();
  });

  it("incluye los extremos y distingue una no-lectura de un cero", () => {
    for (const valor of [8, 20, 38]) expect(fueraDeRango(MODOS[0], valor)).toBe(false);
    for (const valor of [0, 7.99, 38.01]) expect(fueraDeRango(MODOS[0], valor)).toBe(true);
  });

  it("un límite nulo no impone una cota y el otro sigue rigiendo", () => {
    expect(fueraDeRango({ ...MODOS[0], rangeMin: null }, -1)).toBe(false);
    expect(fueraDeRango({ ...MODOS[0], rangeMin: null }, 39)).toBe(true);
    expect(fueraDeRango({ ...MODOS[0], rangeMax: null }, 100)).toBe(false);
    expect(fueraDeRango({ ...MODOS[0], rangeMax: null }, 7)).toBe(true);
    expect(fueraDeRango({ ...MODOS[0], rangeMin: null, rangeMax: null }, 0)).toBe(false);
  });
});
