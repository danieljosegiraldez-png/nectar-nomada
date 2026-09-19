import { describe, expect, it } from "vitest";
import { carenciaDeIntervencion, reentradaDeIntervencion, type IntervencionParaCarencia } from "../../lib/traceability/carenciaDeIntervencion";
import { libreDesdeDe, diasQueFaltanDe } from "../../lib/apiary/carencia";

const aplicada = new Date("2026-09-10T15:00:00Z");
const i = (lineas: IntervencionParaCarencia["lineas"], kind: IntervencionParaCarencia["kind"] = "aplicacion"): IntervencionParaCarencia =>
  ({ id: "x", kind, occurredAt: aplicada, lineas });

describe("carenciaDeIntervencion", () => {
  it("la mezcla manda por la MÁS LARGA, no por la primera", () => {
    const r = carenciaDeIntervencion(i([{ withdrawalDays: 3, reentryHours: 0 }, { withdrawalDays: 14, reentryHours: 0 }]), new Date("2026-09-12T15:00:00Z"));
    expect(r).toEqual({ estado: "conocida", libreDesde: new Date("2026-09-24T15:00:00Z"), diasQueFaltan: 12 });
  });

  it("una línea sin declarar la vuelve DESCONOCIDA aunque otra declare, con «al menos hasta»", () => {
    const r = carenciaDeIntervencion(i([{ withdrawalDays: 7, reentryHours: 0 }, { withdrawalDays: null, reentryHours: 0 }]), new Date("2026-09-11T15:00:00Z"));
    expect(r).toEqual({ estado: "desconocida", alMenosHasta: new Date("2026-09-17T15:00:00Z") });
  });

  it("todas sin declarar: desconocida sin «al menos»", () => {
    expect(carenciaDeIntervencion(i([{ withdrawalDays: null, reentryHours: null }]), aplicada))
      .toEqual({ estado: "desconocida", alMenosHasta: null });
  });

  it("DESCONOCIDA no pasa a cumplida con el tiempo", () => {
    const r = carenciaDeIntervencion(i([{ withdrawalDays: 1, reentryHours: 0 }, { withdrawalDays: null, reentryHours: 0 }]), new Date("2030-01-01T00:00:00Z"));
    expect(r.estado).toBe("desconocida");
  });

  it("cero declarado es cumplida en el acto, no desconocida", () => {
    expect(carenciaDeIntervencion(i([{ withdrawalDays: 0, reentryHours: 0 }]), aplicada))
      .toEqual({ estado: "cumplida", libreDesde: aplicada });
  });

  it("manejo cultural: no aplica, NO desconocida", () => {
    expect(carenciaDeIntervencion(i([], "manejo_cultural"), aplicada)).toEqual({ estado: "no_aplica" });
  });

  it("una intervención POSTERIOR a la fecha no impone carencia sobre ella", () => {
    expect(carenciaDeIntervencion(i([{ withdrawalDays: 30, reentryHours: 0 }]), new Date("2026-09-09T00:00:00Z")))
      .toEqual({ estado: "no_aplica" });
  });

  it("medio día que queda cuenta como un día (redondeo hacia arriba)", () => {
    const r = carenciaDeIntervencion(i([{ withdrawalDays: 1, reentryHours: 0 }]), new Date("2026-09-11T03:00:00Z"));
    expect(r).toMatchObject({ estado: "conocida", diasQueFaltan: 1 });
  });
});

describe("reentradaDeIntervencion", () => {
  it("vigente hasta la hora exacta; cumplida desde ella", () => {
    const x = i([{ withdrawalDays: 0, reentryHours: 4 }, { withdrawalDays: 0, reentryHours: 24 }]);
    expect(reentradaDeIntervencion(x, new Date("2026-09-11T14:59:00Z"))).toEqual({ estado: "vigente", libreDesde: new Date("2026-09-11T15:00:00Z") });
    expect(reentradaDeIntervencion(x, new Date("2026-09-11T15:00:00Z")).estado).toBe("cumplida");
  });
  it("sin declarar: desconocida, para siempre", () => {
    expect(reentradaDeIntervencion(i([{ withdrawalDays: 0, reentryHours: null }]), new Date("2030-01-01T00:00:00Z")).estado).toBe("desconocida");
  });
  it("manejo cultural: no aplica", () => {
    expect(reentradaDeIntervencion(i([], "manejo_cultural"), aplicada)).toEqual({ estado: "no_aplica" });
  });
});

describe("el apiario sigue contando igual tras mover la aritmética", () => {
  it("libreDesdeDe y diasQueFaltanDe se reexportan con el mismo resultado", () => {
    const libre = libreDesdeDe(aplicada, 2);
    expect(libre).toEqual(new Date("2026-09-12T15:00:00Z"));
    expect(diasQueFaltanDe(libre, new Date("2026-09-12T14:00:00Z"))).toBe(1);
  });
});
