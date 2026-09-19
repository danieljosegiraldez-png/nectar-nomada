import { describe, expect, it } from "vitest";
import { difierenMarcasDeCarencia } from "../../lib/traceability/difierenMarcasDeCarencia";

/**
 * Tarea 8, ronda de arreglos 1 (importante #2, hueco de spec §3.4). Hermético:
 * función pura, sin base.
 */
describe("difierenMarcasDeCarencia", () => {
  it("foto vacía y cálculo con carencia: difiere", () => {
    expect(difierenMarcasDeCarencia([], [{ interventionId: "i1", diasQueFaltaban: 3 }])).toBe(true);
  });

  it("foto vacía y cálculo vacío: NO difiere", () => {
    expect(difierenMarcasDeCarencia([], [])).toBe(false);
  });

  it("mismas marcas, en otro orden: NO difiere", () => {
    const foto = [
      { interventionId: "b", diasQueFaltaban: 1 },
      { interventionId: "a", diasQueFaltaban: null },
    ];
    const calculo = [
      { interventionId: "a", diasQueFaltaban: null },
      { interventionId: "b", diasQueFaltaban: 1 },
    ];
    expect(difierenMarcasDeCarencia(foto, calculo)).toBe(false);
  });

  it("misma intervención, distinto diasQueFaltaban: difiere", () => {
    expect(
      difierenMarcasDeCarencia([{ interventionId: "i1", diasQueFaltaban: 3 }], [{ interventionId: "i1", diasQueFaltaban: 2 }]),
    ).toBe(true);
  });
});
