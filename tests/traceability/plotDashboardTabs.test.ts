import { describe, expect, it } from "vitest";
import { pestanaValida, PESTANAS_DE_PARCELA } from "../../app/plots/[id]/pestanas";

describe("pestanaValida", () => {
  it("acepta cada pestaña declarada", () => {
    for (const p of PESTANAS_DE_PARCELA) expect(pestanaValida(p)).toBe(p);
  });

  it("incluye fotos, en el orden resumen/trampas/condiciones/muestras/fotos", () => {
    expect(PESTANAS_DE_PARCELA).toEqual(["resumen", "trampas", "condiciones", "muestras", "fotos"]);
  });

  it("cae a resumen ante cualquier otra cosa", () => {
    expect(pestanaValida(undefined)).toBe("resumen");
    expect(pestanaValida("")).toBe("resumen");
    expect(pestanaValida("no-existe")).toBe("resumen");
  });
});
