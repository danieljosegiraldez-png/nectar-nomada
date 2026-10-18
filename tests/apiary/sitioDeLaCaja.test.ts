/**
 * **En qué sitio estaba una caja un día** — la regla que decidió Daniel el 2026-10-08 (V-H2 de la
 * revisión del Apiario), escrita una sola vez en `lib/apiary/sitioDeLaCaja.ts`: el traslado es de
 * día (ADR-112), la caja sigue en el ORIGEN todo ese día y cuenta en el destino desde el siguiente.
 * El día se mide en la zona del sitio (Panamá si no la declara).
 *
 * Hermético: la regla es pura; quien la usa trae las colocaciones de la base.
 */
import { describe, expect, it } from "vitest";
import { diaDelSitio, sitioEnElDia } from "../../lib/apiary/sitioDeLaCaja";

const D = (s: string) => new Date(s);
const ANTES = D("2026-01-01T00:00:00Z");
const DIA_DEL_TRASLADO = D("2026-05-20T00:00:00Z"); // campo de día, como lo guarda `trasladarColmenas`
const TRASLADADA = [
  { locationId: "origen", startedAt: ANTES, endedAt: DIA_DEL_TRASLADO },
  { locationId: "destino", startedAt: DIA_DEL_TRASLADO, endedAt: null },
];

describe("el día de un instante, en la zona del sitio", () => {
  it("las 03:00 UTC del 21 son el 20 en Panamá, que es la zona por defecto", () => {
    expect(diaDelSitio(D("2026-05-21T03:00:00Z"), null).toISOString()).toBe("2026-05-20T00:00:00.000Z");
  });
  it("y el 21 si el sitio declara UTC: la zona del sitio manda", () => {
    expect(diaDelSitio(D("2026-05-21T03:00:00Z"), "UTC").toISOString()).toBe("2026-05-21T00:00:00.000Z");
  });
});

describe("en qué sitio estaba una caja un día", () => {
  it("EL DÍA DEL TRASLADO sigue en el origen", () => {
    expect(sitioEnElDia(TRASLADADA, DIA_DEL_TRASLADO)).toBe("origen");
  });
  it("desde el día siguiente, en el destino", () => {
    expect(sitioEnElDia(TRASLADADA, D("2026-05-21T00:00:00Z"))).toBe("destino");
  });
  it("y el día anterior, en el origen", () => {
    expect(sitioEnElDia(TRASLADADA, D("2026-05-19T00:00:00Z"))).toBe("origen");
  });
  it("una colocación que empieza a media tarde cuenta ese día entero", () => {
    // La colocación inicial se abre en `installedAt ?? createdAt`, que es un instante.
    expect(sitioEnElDia([{ locationId: "aqui", startedAt: D("2026-05-20T15:30:00Z"), endedAt: null }], DIA_DEL_TRASLADO)).toBe("aqui");
  });
  it("sin colocación que toque ese día, no consta: `null`, no «donde está hoy»", () => {
    expect(sitioEnElDia(TRASLADADA, D("2025-12-31T00:00:00Z"))).toBeNull();
    expect(sitioEnElDia([], DIA_DEL_TRASLADO)).toBeNull();
  });
});
