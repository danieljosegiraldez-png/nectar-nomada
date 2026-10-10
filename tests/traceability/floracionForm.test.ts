import { describe, expect, it } from "vitest";
import { leerCierreDeFloracion, leerFloracion } from "../../lib/traceability/floracionForm";
import { FechaDeDiaInvalida } from "../../lib/time/localDateTime";

/**
 * F1 — los formularios de floración entregan DÍAS, no instantes.
 *
 * El aviso de polinizadores compara días de calendario (`hayFloracion`), así que el fin tiene que
 * llegar como la medianoche UTC del día elegido. Si llegara como «el final de ese día» en Panamá,
 * caería en el día siguiente UTC y el aviso se alargaría un día. Sin base: el riesgo vive en la
 * lectura del formulario, no en el servicio.
 */
function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [clave, valor] of Object.entries(campos)) f.append(clave, valor);
  return f;
}

const ID = "3f2a9c1e-8b7d-4e6f-9a0b-1c2d3e4f5a6b";

describe("leerFloracion", () => {
  it("el inicio y el fin entran como el día elegido, a medianoche UTC", () => {
    const e = leerFloracion(formulario({ locationId: "p1", startsAt: "2027-03-01", endsAt: "2027-03-20" }));
    expect(e.startsAt?.toISOString()).toBe("2027-03-01T00:00:00.000Z");
    expect(e.endsAt?.toISOString()).toBe("2027-03-20T00:00:00.000Z");
    expect(e.locationId).toBe("p1");
  });

  it("lo vacío llega `null`: toda la parcela, sin fin, sin observador, sin nota", () => {
    const e = leerFloracion(
      formulario({ locationId: "p1", plotBlockId: "", startsAt: "2027-03-01", endsAt: "", observerPersonId: "", notes: "  " }),
    );
    expect(e).toMatchObject({ plotBlockId: null, endsAt: null, observerPersonId: null, notes: null });
  });

  it("sin inicio llega `null` y lo decide la acción; un día que no existe se rechaza", () => {
    expect(leerFloracion(formulario({ locationId: "p1" })).startsAt).toBeNull();
    expect(() => leerFloracion(formulario({ locationId: "p1", startsAt: "2027-02-31" }))).toThrow(FechaDeDiaInvalida);
  });
});

describe("leerCierreDeFloracion", () => {
  it("el fin entra como día y la portada se conserva si es un id", () => {
    const e = leerCierreDeFloracion(formulario({ plotBloomId: ID, endsAt: "2027-03-20", portadaId: ID }));
    expect(e.endsAt?.toISOString()).toBe("2027-03-20T00:00:00.000Z");
    expect(e.plotBloomId).toBe(ID);
    expect(e.portadaId).toBe(ID);
  });

  it("una portada que no es un id no se usa para volver", () => {
    expect(leerCierreDeFloracion(formulario({ plotBloomId: ID, endsAt: "2027-03-20", portadaId: "../ajustes" })).portadaId).toBeNull();
  });
});
