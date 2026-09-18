import { describe, expect, it } from "vitest";
import { estadoDeRutina } from "../../lib/rutinas/estado";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const reg = (s: string, anulado = false) => ({ performedOn: d(s), voidedAt: anulado ? d(s) : null });

/**
 * Se llama a la función con las entradas que la romperían, no a través de datos
 * reales que no la ejercitan (regla de la casa, 2026-09-07).
 */
describe("estadoDeRutina", () => {
  it("sin registros ni fecha de alta: sin referencia, nunca «al día»", () => {
    expect(estadoDeRutina({ intervalDays: 7, registros: [], alta: null, hoy: "2026-09-18" })).toEqual({
      estado: "sin_referencia",
      ultimo: null,
    });
  });

  it("sólo registros anulados cuentan como ninguno", () => {
    const r = estadoDeRutina({ intervalDays: 7, registros: [reg("2026-09-15", true)], alta: null, hoy: "2026-09-18" });
    expect(r.estado).toBe("sin_referencia");
  });

  it("sin registros usa la fecha de alta", () => {
    expect(estadoDeRutina({ intervalDays: 10, registros: [], alta: d("2026-09-01"), hoy: "2026-09-18" })).toEqual({
      estado: "vencida",
      ultimo: null,
      proximo: "2026-09-11",
      pasaron: 7,
    });
  });

  it("el día exacto del vencimiento todavía está al día, con 0 días", () => {
    expect(estadoDeRutina({ intervalDays: 7, registros: [reg("2026-09-11")], alta: null, hoy: "2026-09-18" })).toEqual({
      estado: "al_dia",
      ultimo: "2026-09-11",
      proximo: "2026-09-18",
      faltan: 0,
    });
  });

  it("un día después, vencida por 1", () => {
    const r = estadoDeRutina({ intervalDays: 7, registros: [reg("2026-09-10")], alta: null, hoy: "2026-09-18" });
    expect(r).toEqual({ estado: "vencida", ultimo: "2026-09-10", proximo: "2026-09-17", pasaron: 1 });
  });

  it("manda el registro válido más reciente, no el primero de la lista", () => {
    const r = estadoDeRutina({
      intervalDays: 30,
      registros: [reg("2026-09-17", true), reg("2026-08-01"), reg("2026-09-01")],
      alta: d("2026-01-01"),
      hoy: "2026-09-18",
    });
    expect(r).toEqual({ estado: "al_dia", ultimo: "2026-09-01", proximo: "2026-10-01", faltan: 13 });
  });

  it("cruza cambios de mes y años bisiestos por calendario, no por milisegundos", () => {
    const r = estadoDeRutina({ intervalDays: 1, registros: [reg("2028-02-28")], alta: null, hoy: "2028-02-29" });
    expect(r).toEqual({ estado: "al_dia", ultimo: "2028-02-28", proximo: "2028-02-29", faltan: 0 });
  });

  it("ningún camino devuelve NaN", () => {
    const casos = [
      estadoDeRutina({ intervalDays: 7, registros: [], alta: null, hoy: "2026-09-18" }),
      estadoDeRutina({ intervalDays: 7, registros: [reg("2026-09-10")], alta: null, hoy: "2026-09-18" }),
      estadoDeRutina({ intervalDays: 7, registros: [reg("2026-09-17")], alta: null, hoy: "2026-09-18" }),
    ];
    for (const c of casos) {
      for (const v of Object.values(c)) if (typeof v === "number") expect(Number.isNaN(v)).toBe(false);
    }
  });

  it("un `hoy` mal formado lanza en vez de comparar mal en silencio", () => {
    expect(() => estadoDeRutina({ intervalDays: 7, registros: [], alta: d("2026-09-01"), hoy: "18/09/2026" })).toThrow();
  });

  it("un intervalo no positivo lanza (la base ya lo impide; aquí no se inventa)", () => {
    expect(() => estadoDeRutina({ intervalDays: 0, registros: [], alta: d("2026-09-01"), hoy: "2026-09-18" })).toThrow();
  });
});
