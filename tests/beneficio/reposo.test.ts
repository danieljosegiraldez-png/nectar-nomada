import { describe, expect, it } from "vitest";

import { evaluarReposo } from "../../lib/beneficio/reposo";

/**
 * El reposo es una **edad**, no una fase. Estas pruebas guardan tres cosas que
 * el diseño decidió a propósito y que son fáciles de romper sin querer:
 *
 * 1. **Avisa, no bloquea.** Ninguna lectura de aquí impide nada. Si alguien
 *    añade un `throw` por reposo insuficiente, la doctrina de la casa dice que
 *    se esquiva en el patio y entonces el sistema sabe menos.
 * 2. **El reloj arranca con OBJETIVO ALCANZADO**, no con el fin del secado. Un
 *    secado abandonado no reposa: se quedó a medias.
 * 3. **Sin umbral no se inventa un umbral.** Se declara la limitación, igual
 *    que `SIN_INSTRUMENTO_DECLARADO` hace hoy.
 *
 * Spec: docs/superpowers/specs/2026-09-16-reposo-trilla-y-subproductos-design.md §A.
 */

const PERFIL = { diasParaMuestra: 30, diasParaVenta: 60 } as const;
const FIN = new Date("2026-01-01T00:00:00Z");
const dias = (n: number) => new Date(FIN.getTime() + n * 86_400_000);

describe("la edad de reposo", () => {
  it("a los 10 días avisa de las dos cosas y NO bloquea ninguna", () => {
    const e = evaluarReposo({
      finDeSecado: FIN,
      desenlace: "target_reached",
      perfil: PERFIL,
      ahora: dias(10),
    });
    expect(e.diasDeReposo).toBe(10);
    expect(e.muestra).toBe("TEMPRANA");
    expect(e.venta).toBe("TEMPRANA");
    // El guardia del «avisa, no bloquea»: la forma del resultado no tiene
    // ninguna puerta que cerrar. Si alguien añade `bloquea`, esta cae.
    expect(Object.keys(e).sort()).toEqual(
      ["diasDeReposo", "limitaciones", "muestra", "venta"],
    );
  });

  it("a los 35 días la muestra ya no avisa y la venta sí", () => {
    const e = evaluarReposo({
      finDeSecado: FIN,
      desenlace: "target_reached",
      perfil: PERFIL,
      ahora: dias(35),
    });
    expect(e.muestra).toBe("EN_PLAZO");
    expect(e.venta).toBe("TEMPRANA");
  });

  it("a los 60 días exactos la venta entra en plazo — el borde es inclusivo", () => {
    const e = evaluarReposo({
      finDeSecado: FIN,
      desenlace: "target_reached",
      perfil: PERFIL,
      ahora: dias(60),
    });
    expect(e.venta).toBe("EN_PLAZO");
  });

  it("a los 59 no — el control positivo del borde, sin el cual «inclusivo» no dice nada", () => {
    const e = evaluarReposo({
      finDeSecado: FIN,
      desenlace: "target_reached",
      perfil: PERFIL,
      ahora: dias(59),
    });
    expect(e.venta).toBe("TEMPRANA");
  });

  it("un secado ABANDONADO no arranca el reloj, y lo dice", () => {
    const e = evaluarReposo({
      finDeSecado: FIN,
      desenlace: "abandoned",
      perfil: PERFIL,
      ahora: dias(90),
    });
    expect(e.diasDeReposo).toBeNull();
    expect(e.limitaciones).toContain("SECADO_SIN_OBJETIVO_ALCANZADO");
  });

  it("sin fin de secado tampoco, y con OTRA limitación — las dos causas no se confunden", () => {
    const e = evaluarReposo({
      finDeSecado: null,
      desenlace: null,
      perfil: PERFIL,
      ahora: dias(90),
    });
    expect(e.diasDeReposo).toBeNull();
    expect(e.limitaciones).toContain("SIN_FIN_DE_SECADO");
    expect(e.limitaciones).not.toContain("SECADO_SIN_OBJETIVO_ALCANZADO");
  });

  it("sin perfil de reposo no inventa umbrales, y lo declara", () => {
    const e = evaluarReposo({
      finDeSecado: FIN,
      desenlace: "target_reached",
      perfil: undefined,
      ahora: dias(90),
    });
    expect(e.diasDeReposo).toBe(90);
    expect(e.muestra).toBe("SIN_UMBRAL");
    expect(e.venta).toBe("SIN_UMBRAL");
    expect(e.limitaciones).toContain("PERFIL_SIN_REPOSO");
  });
});
