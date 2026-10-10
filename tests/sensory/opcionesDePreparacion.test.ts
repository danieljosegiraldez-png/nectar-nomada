import { describe, expect, it } from "vitest";
import { opcionesDePreparacion } from "../../lib/sensory/opcionesDePreparacion";

const textos = {
  sinPerfil: "sin perfil",
  sinEquipo: "sin equipo",
  linajeDemasiadoHondo: "linaje demasiado hondo",
  describirTueste: ({ date, profile, equipment, reference }: { date: string; profile: string; equipment: string; reference: string }) =>
    `${date} · ${profile} · ${equipment} · Referencia ${reference}`,
};

const muestra = {
  id: "sample-1",
  sampleCode: "M-1",
  sampleType: "green_coffee",
  description: null,
  lotCode: "L-1",
  organizationName: "Las Nubes",
  processGrade: null,
};

describe("opciones de preparación para cata", () => {
  it("no ofrece una muestra sin tueste para una cata nueva", () => {
    expect(opcionesDePreparacion({ ...muestra, roastSessions: [] }, textos)).toEqual([]);
  });

  it("ofrece por separado dos tuestes de la misma muestra", () => {
    const opciones = opcionesDePreparacion({
      ...muestra,
      roastSessions: [
        { id: "roast-a", startedAt: new Date("2026-09-20T12:00:00Z"), equipment: { name: "Ikawa" }, recipeVersion: null },
        { id: "roast-b", startedAt: new Date("2026-09-21T12:00:00Z"), equipment: null, recipeVersion: { version: 2, recipe: { name: "Claro" } } },
      ],
    }, textos);

    expect(opciones.map((o) => [o.sampleId, o.roastSessionId])).toEqual([
      ["sample-1", "roast-a"],
      ["sample-1", "roast-b"],
    ]);
    expect(opciones[0]?.label).toContain("Ikawa");
    expect(opciones[1]?.label).toContain("Claro v2");
  });

  it("distingue tuestes con los mismos datos y conserva su referencia completa", () => {
    const ids = ["747251f0-6dd0-4906-bf4b-3b65e61a5dac", "747251f0-6dd0-4906-bf4b-3b65e61a5dad"];
    const opciones = opcionesDePreparacion({
      ...muestra,
      roastSessions: ids.map((id) => ({ id, startedAt: new Date("2026-10-07T12:00:00Z"), equipment: { name: "Ikawa" }, recipeVersion: null })),
    }, textos);
    expect(opciones[0]?.label).not.toBe(opciones[1]?.label);
    ids.forEach((id, index) => {
      expect(opciones[index]?.label).toContain(id);
      expect(opciones[index]?.roastSessionId).toBe(id);
    });
  });

  /**
   * Tarea 9, ronda de arreglo 1 (2026-10-02): una muestra cuyo lote tiene más de 64 generaciones no tiene grado que leer (R1
   * lanza `lineage_too_deep`), y la etiqueta lo DICE en el sitio del grado. Sin esto la fila saldría sin grado, igual que una
   * muestra cuyo café de verdad no lo tiene.
   */
  it("una muestra de linaje demasiado hondo lo dice en el sitio del grado", () => {
    const tueste = [{ id: "roast-a", startedAt: new Date("2026-09-20T12:00:00Z"), equipment: null, recipeVersion: null }];
    const [honda] = opcionesDePreparacion({ ...muestra, linajeDemasiadoHondo: true, roastSessions: tueste }, textos);
    expect(honda?.label).toContain("L-1 · Las Nubes · linaje demasiado hondo · green_coffee");
    // Control: sin la marca, ese texto no sale.
    const [normal] = opcionesDePreparacion({ ...muestra, linajeDemasiadoHondo: false, roastSessions: tueste }, textos);
    expect(normal?.label).not.toContain("linaje demasiado hondo");
  });
});
