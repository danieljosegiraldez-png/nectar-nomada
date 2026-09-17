import { describe, expect, it } from "vitest";

import { veredictoDelLote, type VeredictoDeFase } from "../../lib/beneficio/desdeElLote";

/**
 * El reposo llega hasta el veredicto — Tarea 9.
 *
 * Sin esto, `evaluarReposo` se construía y no lo llamaba nadie: los días se
 * calculaban y no llegaban a ninguna pantalla.
 */
const AHORA = new Date("2026-06-01T00:00:00Z");
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000);

function enReposo(dias: number) {
  return {
    fase: { tipo: "reposo" as const, iniciadaEn: haceDias(dias) },
    gradoDeProceso: "Washed",
    mediciones: [],
    ahora: AHORA,
  };
}

describe("el reposo en el veredicto del lote", () => {
  it("un lote con 41 días emite su veredicto con los días y las dos compuertas", () => {
    const v = veredictoDelLote(enReposo(41)) as VeredictoDeFase;
    expect(v.fase).toBe("reposo");
    expect(v.reposo?.diasDeReposo).toBe(41);
    expect(v.reposo?.muestra).toBe("EN_PLAZO");
    expect(v.reposo?.venta).toBe("TEMPRANA");
  });

  it("a los 90 días la venta ya está en plazo", () => {
    const v = veredictoDelLote(enReposo(90)) as VeredictoDeFase;
    expect(v.reposo?.venta).toBe("EN_PLAZO");
  });

  it("NO cae por SIN_LECTURAS: el reposo es una edad, no una medición", () => {
    // Las otras dos fases se rinden sin mediciones. Un lote reposando en bodega
    // no produce ninguna y sigue teniendo días. Si esta prueba cae, alguien
    // metió el reposo detrás de la comprobación de lecturas.
    const v = veredictoDelLote(enReposo(41));
    expect(v).not.toBe("SIN_LECTURAS");
  });

  it("declara UMBRAL_SIN_VARIETAL, porque el umbral es del proceso", () => {
    // El spec §A.1 pide umbral por varietal Y proceso; esto hace uno. Se
    // declara en vez de disimularlo: el operario tiene que saber que el número
    // que ve es del lavado y no de su Geisha.
    const v = veredictoDelLote(enReposo(41)) as VeredictoDeFase;
    expect(v.limitaciones).toContain("UMBRAL_SIN_VARIETAL");
  });

  it("un grado sin perfil sigue diciéndolo — el control de que no inventa umbrales", () => {
    const v = veredictoDelLote({ ...enReposo(41), gradoDeProceso: "Inventado" });
    expect(v).toBe("GRADO_SIN_PERFIL");
  });
});
