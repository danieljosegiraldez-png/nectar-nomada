/**
 * `volverAValido` — Tarea 6, fix round 1. Pura, hermética: sin base.
 *
 * El guardia es que un `volverA` de OTRA parcela, o que no sea una ruta de
 * `/plots/...`, nunca sobrevive — esa es la frontera contra una redirección
 * abierta. El caso "otra parcela" no basta por sí solo: un `startsWith` sin
 * frontera de caracter dejaría pasar `/plots/abc123` contra el id `abc`, así
 * que hay un caso específico para eso.
 */
import { describe, expect, it } from "vitest";
import { volverAValido } from "../../lib/traceability/volverA";

describe("volverAValido", () => {
  const locationId = "loc-123";

  it("acepta la ruta de la misma parcela con ?pestana=", () => {
    expect(volverAValido("/plots/loc-123?pestana=muestras", locationId)).toBe(
      "/plots/loc-123?pestana=muestras",
    );
  });

  it("acepta la ruta desnuda de la misma parcela, sin query", () => {
    expect(volverAValido("/plots/loc-123", locationId)).toBe("/plots/loc-123");
  });

  it("rechaza la parcela de otro id", () => {
    expect(volverAValido("/plots/otra-parcela?pestana=muestras", locationId)).toBeNull();
  });

  it("rechaza un id que sólo coincide como prefijo (loc-123 dentro de loc-1234)", () => {
    expect(volverAValido("/plots/loc-1234?pestana=muestras", locationId)).toBeNull();
  });

  it("rechaza una URL absoluta", () => {
    expect(
      volverAValido("https://evil.example.com/plots/loc-123?pestana=muestras", locationId),
    ).toBeNull();
  });

  it("rechaza una URL protocol-relative (//evil)", () => {
    expect(volverAValido("//evil.example.com/plots/loc-123", locationId)).toBeNull();
  });

  it("rechaza un valor vacío", () => {
    expect(volverAValido("", locationId)).toBeNull();
  });

  it("rechaza null y undefined — el caso «sin volverA»", () => {
    expect(volverAValido(null, locationId)).toBeNull();
    expect(volverAValido(undefined, locationId)).toBeNull();
  });
});
