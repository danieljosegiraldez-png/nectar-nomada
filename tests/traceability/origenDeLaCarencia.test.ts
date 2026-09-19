import { describe, expect, it } from "vitest";
import { origenDeLaCarencia } from "../../lib/traceability/origenDeLaCarencia";

/**
 * Tarea 8, ronda de arreglos 1 (importante #1). Los tres casos de la regla:
 * «del producto» sólo cuando el valor mostrado ES el del producto; «indicada
 * al registrar» cuando viene de la línea original y difiere; «no declarada»
 * cuando es nulo. Hermético: función pura, sin base.
 */
describe("origenDeLaCarencia", () => {
  it("nulo: no declarada, sin importar el producto ni si es la original", () => {
    expect(origenDeLaCarencia(null, 14, true)).toBe("no_declarada");
    expect(origenDeLaCarencia(null, null, false)).toBe("no_declarada");
  });

  it("recién precargado de OTRO producto (no es la original): siempre del producto", () => {
    expect(origenDeLaCarencia(14, 14, false)).toBe("del_producto");
  });

  it("es la original y COINCIDE con el default del producto: del producto", () => {
    expect(origenDeLaCarencia(14, 14, true)).toBe("del_producto");
  });

  it("es la original y DIFIERE del default del producto: indicada al registrar", () => {
    expect(origenDeLaCarencia(7, 14, true)).toBe("indicada_al_registrar");
  });
});
