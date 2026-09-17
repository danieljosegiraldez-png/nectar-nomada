/**
 * Hermética: no importa lib/db. Los tres casos que tienen que poder fallar son
 * «sin evento nunca es levante», «gana el registrado último aunque su fecha
 * sea anterior» y «con el mismo `createdAt`, el desempate es estable y va por
 * `id`, no por orden de llegada».
 */
import { describe, expect, it } from "vitest";
import { estadoDeProduccion, estadosPorCohorte, type EventoDeProduccion } from "../../lib/traceability/estadoDeProduccion";

const ev = (over: Partial<EventoDeProduccion>): EventoDeProduccion => ({
  id: "00000000-0000-0000-0000-000000000001",
  plantingCohortId: "c1",
  occurredAt: new Date("2021-01-01T00:00:00Z"),
  occurredPrecision: "year",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  provenanceClass: "original_record",
  dataQuality: null,
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
      provenanceClass: "original_record",
      dataQuality: null,
    });
  });

  it("gana el REGISTRADO más recientemente aunque su fecha sea ANTERIOR", () => {
    const equivocado = ev({ occurredAt: new Date("2023-01-01T00:00:00Z"), createdAt: new Date("2026-03-01T00:00:00Z") });
    const corregido = ev({
      occurredAt: new Date("2020-01-01T00:00:00Z"),
      createdAt: new Date("2026-04-01T00:00:00Z"),
      provenanceClass: "direct_observation",
      dataQuality: "provisional",
    });
    const estado = estadoDeProduccion([equivocado, corregido]);
    expect(estado.estado === "en_produccion" && estado.desde.toISOString()).toBe("2020-01-01T00:00:00.000Z");
    // R12: la procedencia que se enseña es la del evento GANADOR, no la del primero.
    expect(estado).toMatchObject({ provenanceClass: "direct_observation", dataQuality: "provisional" });
  });

  it("con el MISMO createdAt, el desempate es por id mayor, sea cual sea el orden de llegada", () => {
    const idMenor = ev({
      id: "00000000-0000-0000-0000-000000000001",
      occurredAt: new Date("2023-01-01T00:00:00Z"),
      createdAt: new Date("2026-03-01T00:00:00Z"),
    });
    const idMayor = ev({
      id: "00000000-0000-0000-0000-000000000002",
      occurredAt: new Date("2020-01-01T00:00:00Z"),
      createdAt: new Date("2026-03-01T00:00:00Z"),
    });
    const esperado = {
      estado: "en_produccion",
      desde: new Date("2020-01-01T00:00:00Z"),
      precision: "year",
      provenanceClass: "original_record",
      dataQuality: null,
    };
    expect(estadoDeProduccion([idMenor, idMayor])).toEqual(esperado);
    expect(estadoDeProduccion([idMayor, idMenor])).toEqual(esperado);
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
