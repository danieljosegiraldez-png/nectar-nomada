import { describe, expect, it } from "vitest";
import {
  construirPayloadDeMuestraDeSuelo,
  construirPayloadDeMuestraFoliar,
  construirPayloadDePerfilDeSuelo,
  construirPayloadDeSiembra,
} from "../../lib/sync/parcelaPayload";
import { KINDS_DE_PARCELA } from "../../lib/sync/parsearMutaciones";

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

/**
 * **El guardia que el comentario de `KINDS_DE_PARCELA` prometía y no existía.**
 *
 * Ese comentario decía que «la prueba compara esta lista con lo que el cliente
 * encola». Medido: `git grep` daba **dos** usos de la constante, los dos dentro
 * de su propio archivo. Los cuatro `kind` del cliente eran literales sueltos en
 * `lib/sync/parcelaPayload.ts`, y `queueFieldEvent(payload: Record<string,
 * unknown>)` borra los tipos, así que TypeScript tampoco los ataba: renombrar
 * uno de los dos lados dejaba cada anotación de ese tipo en `unknown_kind`
 * **permanente**, sin que nada se pusiera rojo.
 *
 * No lee la fuente: **llama a los cuatro constructores y mira el `kind` que
 * producen de verdad**, que es el lado del cliente, y lo compara con la lista
 * que el parseo usa para decidir. Renombrar cualquiera de los dos lados lo
 * rompe.
 */
describe("los kind del cliente y los que el lote reconoce son la misma lista", () => {
  it("los cuatro constructores producen exactamente KINDS_DE_PARCELA", () => {
    const delCliente = [
      construirPayloadDeMuestraDeSuelo(
        form({ sampleCode: "S-01", sampledAt: UN_DIA_QUE_NO_ES_HOY, provenanceClass: "direct_observation" }),
        "loc1",
      ).kind,
      construirPayloadDeMuestraFoliar(
        form({ sampleCode: "F-01", sampledAt: UN_DIA_QUE_NO_ES_HOY, provenanceClass: "direct_observation" }),
        "loc1",
      ).kind,
      construirPayloadDePerfilDeSuelo(
        form({ describedAt: UN_DIA_QUE_NO_ES_HOY, provenanceClass: "direct_observation" }),
        "loc1",
      ).kind,
      construirPayloadDeSiembra(form({ provenanceClass: "direct_observation" }), "loc1").kind,
    ];
    // Control: que sean cuatro distintos. Si dos constructores devolvieran el
    // mismo `kind`, `sort()` contra la lista lo escondería a medias.
    expect(new Set(delCliente).size).toBe(4);
    expect([...delCliente].sort()).toEqual([...KINDS_DE_PARCELA].sort());
  });
});

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

  /**
   * **La prueba que ocupaba este sitio decía lo contrario, y su justificación
   * era falsa.** Fijaba con `Object.keys(p).sort()` que el payload NO llevaba
   * ni las banderas de anaerobiosis ni los horizontes, y lo justificaba
   * diciendo que «no son parte de `MutacionDePerfilDeSuelo` y el servidor los
   * ignoraría o los rechazaría». Las dos mitades eran falsas: ese tipo se
   * escribe en esta misma rama —así que lo que lleve es una decisión, no una
   * restricción heredada— y `createSoilProfile` acepta los cuatro campos
   * (`SoilProfileFields`) y los horizontes (`horizons`) desde antes.
   *
   * El efecto era que el operador cavaba el hoyo, describía cuatro horizontes,
   * la pantalla decía «guardado en este dispositivo» y se guardaba una
   * calicata vacía — con una prueba en verde declarándolo correcto.
   *
   * Se simula el `FormData` real de `SoilProfileForm` en modo CREAR, que es el
   * único que se encola: `name={campo}` para las cuatro observaciones y
   * `` name={`horizonTopCm.${i}`} `` para las filas.
   */
  it("lleva las cuatro banderas de anaerobiosis que el formulario pinta", () => {
    const p = construirPayloadDePerfilDeSuelo(
      form({
        ...BASE,
        mottling: "present",
        greyColours: "absent",
        rootChannelConcretions: "not_observed",
        sourSmell: "present",
      }),
      "loc1",
    );
    expect(p).toMatchObject({
      mottling: "present",
      greyColours: "absent",
      rootChannelConcretions: "not_observed",
      sourSmell: "present",
    });
  });

  it("una bandera de anaerobiosis sin registrar viaja como null, no como cadena vacía", () => {
    const p = construirPayloadDePerfilDeSuelo(form({ ...BASE, mottling: "" }), "loc1");
    expect(p.mottling).toBeNull();
  });

  it("lleva los horizontes, con el ordinal por posición entre las filas NO vacías", () => {
    // La fila 1 se deja EN BLANCO a propósito: el formulario ofrece cuatro y el
    // operador llena las que use. `horizontesDelFormulario` descarta las vacías
    // y numera por posición, así que la tercera fila del formulario tiene que
    // salir con `ordinal: 2`, no con 3. Si el payload copiara el índice, este
    // caso lo vería.
    const p = construirPayloadDePerfilDeSuelo(
      form({
        ...BASE,
        "horizonOrdinal.0": "1",
        "horizonTopCm.0": "0",
        "horizonBottomCm.0": "20",
        "horizonDesignation.0": "Ap",
        "horizonColour.0": "10YR 3/2",
        "horizonStructure.0": "granular",
        "horizonTexture.0": "franco arenoso",
        "horizonOrdinal.1": "2",
        "horizonOrdinal.2": "3",
        "horizonTopCm.2": "20",
        "horizonBottomCm.2": "55",
        "horizonDesignation.2": "Bt",
      }),
      "loc1",
    );
    expect(p.horizons).toHaveLength(2); // control: cuántas leyó, no sólo que hay alguna
    expect(p.horizons[0]).toEqual({
      ordinal: 1,
      topCm: 0,
      bottomCm: 20,
      designation: "Ap",
      colour: "10YR 3/2",
      structure: "granular",
      textureByFeel: "franco arenoso",
      notes: null,
    });
    expect(p.horizons[1]).toMatchObject({ ordinal: 2, topCm: 20, bottomCm: 55, designation: "Bt" });
  });

  it("sin ninguna fila de horizonte llena, el array va vacío", () => {
    const p = construirPayloadDePerfilDeSuelo(form({ ...BASE, "horizonOrdinal.0": "1" }), "loc1");
    expect(p.horizons).toEqual([]);
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
