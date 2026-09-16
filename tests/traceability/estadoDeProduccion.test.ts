/**
 * Hermética: no importa lib/db. Los dos casos que tienen que poder fallar son
 * «sin evento nunca es levante» y «gana el registrado último aunque su fecha
 * sea anterior».
 */
import { describe, expect, it } from "vitest";
import { estadoDeProduccion, estadosPorCohorte, type EventoDeProduccion } from "../../lib/traceability/estadoDeProduccion";

const ev = (over: Partial<EventoDeProduccion>): EventoDeProduccion => ({
  plantingCohortId: "c1",
  occurredAt: new Date("2021-01-01T00:00:00Z"),
  occurredPrecision: "year",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

describe("estadoDeProduccion", () => {
  it("sin eventos es «sin marcar», y no existe ningún estado «levante»", () => {
    const estado = estadoDeProduccion([]);
    expect(estado).toEqual({ estado: "sin_marcar" });
  });

  it("con un evento está en producción desde su fecha, con su precisión", () => {
    expect(estadoDeProduccion([ev({})])).toEqual({
      estado: "en_produccion",
      desde: new Date("2021-01-01T00:00:00Z"),
      precision: "year",
    });
  });

  it("gana el REGISTRADO más recientemente aunque su fecha sea ANTERIOR", () => {
    const equivocado = ev({ occurredAt: new Date("2023-01-01T00:00:00Z"), createdAt: new Date("2026-03-01T00:00:00Z") });
    const corregido = ev({ occurredAt: new Date("2020-01-01T00:00:00Z"), createdAt: new Date("2026-04-01T00:00:00Z") });
    const estado = estadoDeProduccion([equivocado, corregido]);
    expect(estado.estado === "en_produccion" && estado.desde.toISOString()).toBe("2020-01-01T00:00:00.000Z");
  });

  it("el orden en que llegan los eventos no cambia el resultado", () => {
    const a = ev({ occurredAt: new Date("2023-01-01T00:00:00Z"), createdAt: new Date("2026-03-01T00:00:00Z") });
    const b = ev({ occurredAt: new Date("2020-01-01T00:00:00Z"), createdAt: new Date("2026-04-01T00:00:00Z") });
    expect(estadoDeProduccion([b, a])).toEqual(estadoDeProduccion([a, b]));
  });
});

describe("estadosPorCohorte", () => {
  it("toda siembra pedida tiene estado, y los eventos de una no se cuelan en otra", () => {
    const mapa = estadosPorCohorte(["c1", "c2"], [ev({ plantingCohortId: "c1" })]);
    expect(mapa.get("c1")?.estado).toBe("en_produccion");
    expect(mapa.get("c2")).toEqual({ estado: "sin_marcar" });
    expect(mapa.size).toBe(2);
  });
});
