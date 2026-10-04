/**
 * R2 de la Parte 1 (2026-10-01): el orden en que se toman las filas de `lot` es el MISMO para todos.
 *
 * Prueba pura: sin base ni `lib/db` (`ordenDeBloqueo.ts` no importa nada), así que corre en el carril
 * hermético de CI. Lo que se fija es la función; que `bloquearLinajes` la use lo fija la prueba con base
 * de `corridaConProceso.test.ts` («el orden del bloqueo»).
 */
import { describe, it, expect } from "vitest";
import { ordenDeBloqueo } from "../../lib/traceability/ordenDeBloqueo";

// Dos ids de uuid con la primera letra a propósito: en el orden de CADENAS, «B» (0x42) va ANTES que «a» (0x61), y en
// minúsculas «a» va antes que «b». Con ids en la misma caja el sort de cadenas no discrimina nada.
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const B = b.toUpperCase();

describe("R2 — ordenDeBloqueo: la caja del uuid no cambia el orden en que se piden las filas", () => {
  it("el insumo discrimina: sin normalizar, el sort de cadenas pone la mayúscula ANTES de la «a» (control)", () => {
    expect([B, a].sort()).toEqual([B, a]);
    expect([b, a].sort()).toEqual([a, b]);
  });

  it("un id en mayúsculas y su duplicado en minúsculas son UNO, y el orden es el de los minúsculos", () => {
    expect(ordenDeBloqueo([B, a, b])).toEqual([a, b]);
  });

  it("dos transacciones que piden los mismos lotes, una con el uuid en mayúsculas, los toman en el mismo orden", () => {
    expect(ordenDeBloqueo([B, a])).toEqual([a, b]);
    expect(ordenDeBloqueo([a, b])).toEqual([a, b]);
  });

  it("no pierde ids distintos ni inventa ninguno", () => {
    const c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    expect(ordenDeBloqueo([c, b, a])).toEqual([a, b, c]);
    expect(ordenDeBloqueo([])).toEqual([]);
  });
});
