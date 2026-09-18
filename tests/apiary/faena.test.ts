/**
 * La faena de colmena: qué sección va abierta según a qué se vino.
 * Spec: docs/superpowers/specs/2026-09-17-faena-de-colmena-y-botiquin-design.md §A.
 */
import { describe, expect, it } from "vitest";
import { FAENAS, faenaDe, seccionAbierta } from "../../lib/apiary/faena";

describe("la faena de colmena", () => {
  it("sin faena, todo abierto — no obliga a elegir", () => {
    for (const s of FAENAS) expect(seccionAbierta(null, s)).toBe(true);
  });

  it("con faena, sólo la suya abierta; las otras plegadas", () => {
    expect(seccionAbierta("alimentar", "alimentar")).toBe(true);
    for (const s of FAENAS.filter((f) => f !== "alimentar")) expect(seccionAbierta("alimentar", s)).toBe(false);
  });

  it("cada faena abre exactamente una sección — ninguna deja las cinco cerradas", () => {
    for (const f of FAENAS) expect(FAENAS.filter((s) => seccionAbierta(f, s))).toEqual([f]);
  });

  it("un valor desconocido es «sin faena», no un error", () => {
    // Un enlace viejo o mal escrito no puede dejar la colmena sin formularios.
    expect(faenaDe("cosechar")).toBe("cosechar");
    expect(faenaDe("fumigar")).toBeNull();
    expect(faenaDe(undefined)).toBeNull();
    expect(faenaDe(["tratar", "revisar"])).toBe("tratar");
  });

  it("las cinco del spec, en su orden", () => {
    expect(FAENAS).toEqual(["revisar", "alimentar", "tratar", "varroa", "cosechar"]);
  });
});
