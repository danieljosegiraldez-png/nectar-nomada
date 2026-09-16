import { describe, expect, it } from "vitest";
import {
  construirPayloadDeMuestraDeSuelo,
  construirPayloadDeMuestraFoliar,
  construirPayloadDePerfilDeSuelo,
  construirPayloadDeSiembra,
} from "../../lib/sync/parcelaPayload";

/**
 * Task 5 — los cuatro payloads que la cola guarda para la captura de parcela.
 *
 * **Por qué este archivo y no uno que renderice un componente.** El encargo
 * original (`task-5-brief.md`) pedía `render(<SoilSampleForm .../>)`, y este
 * repositorio no tiene `jsdom` ni `@testing-library` — ninguna prueba llama a
 * `render()`. Se sigue el patrón de `tests/sync/fieldEventPayload.test.ts`:
 * `FormData` existe en Node, así que la decisión se prueba sin DOM.
 *
 * **Por qué el caso de la fecha usa un día distinto de hoy.** Si la fecha del
 * formulario coincidiera con la de hoy, una implementación que hiciera
 * `sampledAt: new Date().toISOString()` — el defecto que CORRECCIÓN 2 del
 * encargo señala — pasaría esta prueba igual. Por eso `AYER` está fijado a un
 * día que nunca es «hoy».
 */
const form = (campos: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
};

// Un día que nunca coincide con el de la corrida, sea cuando sea.
const UN_DIA_QUE_NO_ES_HOY = "2020-03-01";

describe("construirPayloadDeMuestraDeSuelo", () => {
  const BASE = {
    sampleCode: "S-01",
    sampledAt: UN_DIA_QUE_NO_ES_HOY,
    provenanceClass: "direct_observation",
    dataQuality: "provisional",
  };

  it("la fecha del payload es la del formulario, no la de hoy", () => {
    const p = construirPayloadDeMuestraDeSuelo(form(BASE), "loc1");
    expect(p.sampledAt).toBe("2020-03-01T00:00:00.000Z");
    expect(p.sampledAt).not.toBe(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  });

  it("dataQuality viaja", () => {
    const p = construirPayloadDeMuestraDeSuelo(form(BASE), "loc1");
    expect(p.dataQuality).toBe("provisional");
  });

  it("kind y locationId van fijos, no leídos del formulario", () => {
    const p = construirPayloadDeMuestraDeSuelo(form(BASE), "loc1");
    expect(p).toMatchObject({ kind: "soil_sample", locationId: "loc1" });
  });

  it("un campo vacío del formulario sale como null, no como cadena vacía", () => {
    const p = construirPayloadDeMuestraDeSuelo(
      form({ ...BASE, laboratory: "   ", samplingPointLabel: "", notes: "" }),
      "loc1",
    );
    expect(p.laboratory).toBeNull();
    expect(p.samplingPointLabel).toBeNull();
    expect(p.notes).toBeNull();
  });

  it("las profundidades y el conteo de submuestras llegan como número", () => {
    const p = construirPayloadDeMuestraDeSuelo(
      form({ ...BASE, depthTopCm: "0", depthBottomCm: "20", subSampleCount: "5" }),
      "loc1",
    );
    expect(p).toMatchObject({ depthTopCm: 0, depthBottomCm: 20, subSampleCount: 5 });
  });

  it("sin sampledAt lanza en vez de inventar la fecha de hoy", () => {
    const fd = form(BASE);
    fd.delete("sampledAt");
    expect(() => construirPayloadDeMuestraDeSuelo(fd, "loc1")).toThrow();
  });
});

describe("construirPayloadDeMuestraFoliar", () => {
  const BASE = {
    sampleCode: "F-01",
    sampledAt: UN_DIA_QUE_NO_ES_HOY,
    provenanceClass: "direct_observation",
    dataQuality: "verified",
  };

  it("la fecha del payload es la del formulario, no la de hoy", () => {
    const p = construirPayloadDeMuestraFoliar(form(BASE), "loc1");
    expect(p.sampledAt).toBe("2020-03-01T00:00:00.000Z");
  });

  it("dataQuality viaja", () => {
    const p = construirPayloadDeMuestraFoliar(form(BASE), "loc1");
    expect(p.dataQuality).toBe("verified");
  });

  it("el tri-estado de branchBearingFruit: 'yes' -> true, 'no' -> false, ausente -> null", () => {
    expect(construirPayloadDeMuestraFoliar(form({ ...BASE, branchBearingFruit: "yes" }), "loc1").branchBearingFruit).toBe(true);
    expect(construirPayloadDeMuestraFoliar(form({ ...BASE, branchBearingFruit: "no" }), "loc1").branchBearingFruit).toBe(false);
    expect(construirPayloadDeMuestraFoliar(form(BASE), "loc1").branchBearingFruit).toBeNull();
  });

  it("un campo vacío del formulario sale como null, no como cadena vacía", () => {
    const p = construirPayloadDeMuestraFoliar(form({ ...BASE, cultivar: "", canopyPosition: "" }), "loc1");
    expect(p.cultivar).toBeNull();
    expect(p.canopyPosition).toBeNull();
  });
});

describe("construirPayloadDePerfilDeSuelo", () => {
  const BASE = {
    describedAt: UN_DIA_QUE_NO_ES_HOY,
    provenanceClass: "direct_observation",
    dataQuality: "provisional",
  };

  it("la fecha del payload es la del formulario, no la de hoy", () => {
    const p = construirPayloadDePerfilDeSuelo(form(BASE), "loc1");
    expect(p.describedAt).toBe("2020-03-01T00:00:00.000Z");
  });

  it("dataQuality viaja", () => {
    const p = construirPayloadDePerfilDeSuelo(form(BASE), "loc1");
    expect(p.dataQuality).toBe("provisional");
  });

  it("un campo vacío del formulario sale como null, no como cadena vacía", () => {
    const p = construirPayloadDePerfilDeSuelo(form({ ...BASE, rootDistribution: "", impedingLayerNote: "" }), "loc1");
    expect(p.rootDistribution).toBeNull();
    expect(p.impedingLayerNote).toBeNull();
  });

  it("no lleva horizontes ni las banderas de anaerobiosis: el servidor no las acepta en esta cola", () => {
    const p = construirPayloadDePerfilDeSuelo(form(BASE), "loc1");
    expect(p).not.toHaveProperty("mottling");
    expect(p).not.toHaveProperty("horizonTopCm.0");
  });
});

describe("construirPayloadDeSiembra", () => {
  const BASE = {
    provenanceClass: "direct_observation",
    dataQuality: "provisional",
  };

  it("plantedPrecision viaja junto a plantedAt", () => {
    const p = construirPayloadDeSiembra(
      form({ ...BASE, plantedAt: UN_DIA_QUE_NO_ES_HOY, plantedPrecision: "date" }),
      "loc1",
    );
    expect(p.plantedPrecision).toBe("date");
    expect(p.plantedAt).toBe("2020-03-01T00:00:00.000Z");
  });

  it("dataQuality viaja", () => {
    const p = construirPayloadDeSiembra(form({ ...BASE, plantedPrecision: "date" }), "loc1");
    expect(p.dataQuality).toBe("provisional");
  });

  it("precisión 'year': recorta al primer día de ENERO de ese año, no al de hoy", () => {
    const p = construirPayloadDeSiembra(form({ ...BASE, plantedAt: "2019", plantedPrecision: "year" }), "loc1");
    expect(p.plantedAt).toBe("2019-01-01T00:00:00.000Z");
    expect(p.plantedPrecision).toBe("year");
  });

  it("precisión 'month': recorta al día 1 de ese mes", () => {
    const p = construirPayloadDeSiembra(form({ ...BASE, plantedAt: "2019-05", plantedPrecision: "month" }), "loc1");
    expect(p.plantedAt).toBe("2019-05-01T00:00:00.000Z");
    expect(p.plantedPrecision).toBe("month");
  });

  it("sin plantedAt, los dos van nulos: 'no se sabe cuándo' es una respuesta legítima", () => {
    const p = construirPayloadDeSiembra(form(BASE), "loc1");
    expect(p.plantedAt).toBeNull();
    expect(p.plantedPrecision).toBeNull();
  });

  it("un campo vacío del formulario sale como null, no como cadena vacía", () => {
    const p = construirPayloadDeSiembra(form({ ...BASE, cultivarValueId: "", notes: "" }), "loc1");
    expect(p.cultivarValueId).toBeNull();
    expect(p.notes).toBeNull();
  });
});
