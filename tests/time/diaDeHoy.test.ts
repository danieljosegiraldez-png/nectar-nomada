/** Hermética. «Hoy» es un día, no un instante, y sin zona se va al caso más temprano. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { diaDeHoy } from "../../lib/time/diaDeHoy";

describe("diaDeHoy", () => {
  it("con zona, el día del sitio: las 03:00Z del 16 son todavía el 15 en Panamá", () => {
    expect(diaDeHoy(new Date("2026-09-16T03:00:00Z"), "America/Panama")).toBe("2026-09-15");
  });

  it("sin zona, UTC−12: a las 11:00Z del 16 todavía es 15, aunque en Panamá ya sea 16", () => {
    const ahora = new Date("2026-09-16T11:00:00Z");
    expect(diaDeHoy(ahora, "America/Panama")).toBe("2026-09-16");
    expect(diaDeHoy(ahora, null)).toBe("2026-09-15");
  });

  it("sin zona, a las 13:00Z ya es 16 en cualquier sitio del planeta", () => {
    expect(diaDeHoy(new Date("2026-09-16T13:00:00Z"), null)).toBe("2026-09-16");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // T3: `diaDeHoy` confía en que `en-CA` formatea `YYYY-MM-DD`. Si un runtime
  // formatea otra cosa, las comparaciones de cadenas de los avisos saldrían mal
  // sin error. Con un formateador roto inyectado tiene que lanzar, y decir qué salió.
  it("lanza, diciendo qué salió, si el formateador no devuelve YYYY-MM-DD", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function () {
      return { format: () => "16/9/2026" } as unknown as Intl.DateTimeFormat;
    });
    expect(() => diaDeHoy(new Date("2026-09-16T13:00:00Z"), "America/Panama")).toThrow(/16\/9\/2026/);
  });
});
