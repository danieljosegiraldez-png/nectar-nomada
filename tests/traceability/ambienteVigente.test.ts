import { describe, expect, it } from "vitest";
import { edad, lecturaDelPunto, type LecturaVigente } from "../../lib/traceability/ambienteVigente";

const base = { airTemperatureC: 24, relativeHumidityPct: 61, skyCondition: null, ventilation: null, sourceType: "manual" };
const l = (id: string, rackId: string | null, rackLevel: number | null, hora: string): LecturaVigente =>
  ({ ...base, id, rackId, rackLevel, occurredAt: new Date(hora) });

describe("la lectura de un punto es SÓLO la de ese punto (spec §4.5)", () => {
  const vigentes = [
    l("general", null, null, "2026-09-21T13:00:00Z"),
    l("E1-N2", "E1", 2, "2026-09-21T13:30:00Z"),
    l("E1-N4", "E1", 4, "2026-09-21T11:00:00Z"),
    l("N3-sin-estante", null, 3, "2026-09-21T12:00:00Z"),
  ];
  it("el nivel 3 del estante E1 no tiene lectura propia: null, no la del nivel 2 ni la 4 ni la general", () => {
    expect(lecturaDelPunto(vigentes, { rackId: "E1", rackLevel: 3 })).toBeNull();
  });
  it("control positivo: el nivel 4 del estante E1 sí la tiene, aunque sea más vieja que la del 2", () => {
    expect(lecturaDelPunto(vigentes, { rackId: "E1", rackLevel: 4 })?.id).toBe("E1-N4");
  });
  it("la general sólo responde por el punto general", () => {
    expect(lecturaDelPunto(vigentes, { rackId: null, rackLevel: null })?.id).toBe("general");
  });
  it("«nivel 3 sin estante» es su propio punto: no responde por el nivel 3 de E1", () => {
    expect(lecturaDelPunto(vigentes, { rackId: null, rackLevel: 3 })?.id).toBe("N3-sin-estante");
    expect(lecturaDelPunto(vigentes, { rackId: "E1", rackLevel: 3 })).toBeNull();
  });
  it("de dos del mismo punto, la más reciente", () => {
    const dos = [l("vieja", "E1", 2, "2026-09-21T08:00:00Z"), l("nueva", "E1", 2, "2026-09-21T10:00:00Z")];
    expect(lecturaDelPunto(dos, { rackId: "E1", rackLevel: 2 })?.id).toBe("nueva");
  });
});

describe("la edad, siempre dicha", () => {
  const ahora = new Date("2026-09-21T23:00:00Z");
  it("minutos, horas y días", () => {
    expect(edad(new Date("2026-09-21T22:35:00Z"), ahora)).toEqual({ unidad: "min", n: 25 });
    expect(edad(new Date("2026-09-21T14:00:00Z"), ahora)).toEqual({ unidad: "h", n: 9 });
    expect(edad(new Date("2026-09-18T20:00:00Z"), ahora)).toEqual({ unidad: "d", n: 3 });
  });
  it("una hora futura (reloj adelantado) no da edad negativa", () => {
    expect(edad(new Date("2026-09-21T23:10:00Z"), ahora)).toEqual({ unidad: "min", n: 0 });
  });
});
