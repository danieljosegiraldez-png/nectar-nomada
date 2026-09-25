import { describe, expect, it } from "vitest";
import { opcionesDePreparacion } from "../../lib/sensory/opcionesDePreparacion";

const textos = {
  sinTueste: "sin tueste",
  sinPerfil: "sin perfil",
  sinEquipo: "sin equipo",
  describirTueste: ({ date, profile, equipment }: { date: string; profile: string; equipment: string }) =>
    `${date} · ${profile} · ${equipment}`,
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
  it("conserva una muestra histórica sin tueste específico", () => {
    expect(opcionesDePreparacion({ ...muestra, roastSessions: [] }, textos)).toEqual([
      expect.objectContaining({ key: "sample-1", sampleId: "sample-1", roastSessionId: null }),
    ]);
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
});
