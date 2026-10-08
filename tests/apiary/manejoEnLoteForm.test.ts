import { describe, expect, it } from "vitest";
import { leerManejoEnLote } from "../../lib/apiary/manejoEnLoteForm";

/**
 * El manejo en lote conserva QUÉ se dio de comer (revisión de Apiario del 2026-10-08, V-5).
 *
 * `ManejoEnLoteForm` envía `feedingMaterialKind` —el desplegable con «Azúcar blanca», «Jarabe 1:1»…—
 * y la acción de lote no lo leía: cada colonia quedaba con cantidad y unidad pero sin material, y
 * con «Otro» se guardaba el texto pero no el valor `otro`. La ficha de una colonia y la cola sin
 * conexión sí lo pasaban, así que el dato dependía de la puerta por la que entrara.
 *
 * Prueba sin base: el defecto vivía en la lectura del formulario, no en el servicio
 * (`registrarEventoEnLote` ya acepta el campo).
 */
function formulario(campos: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [clave, valor] of Object.entries(campos)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) f.append(clave, v);
  }
  return f;
}

const ahora = new Date("2026-10-08T15:00:00Z");

describe("leerManejoEnLote — la alimentación en lote guarda el material", () => {
  it("el material elegido en el desplegable llega al servicio", () => {
    const entrada = leerManejoEnLote(
      formulario({
        apiaryId: "a1",
        colonyIds: ["c1", "c2", "c3"],
        eventType: "feeding",
        feedingMaterialKind: "jarabe_1_1",
        feedingQuantity: "3",
        feedingUnit: "lb",
      }),
      ahora,
    );
    expect(entrada.feedingMaterialKind).toBe("jarabe_1_1");
    expect(entrada).toMatchObject({ feedingQuantity: 3, feedingUnit: "lb", feedingMaterial: null });
  });

  it("«Otro» guarda el valor `otro` Y su texto", () => {
    const entrada = leerManejoEnLote(
      formulario({ colonyIds: ["c1"], eventType: "feeding", feedingMaterialKind: "otro", feedingMaterial: " polen de la finca " }),
      ahora,
    );
    expect(entrada.feedingMaterialKind).toBe("otro");
    expect(entrada.feedingMaterial).toBe("polen de la finca");
  });

  it("sin material elegido llega `null`, no una cadena vacía", () => {
    const entrada = leerManejoEnLote(formulario({ colonyIds: ["c1"], eventType: "feeding", feedingMaterialKind: "" }), ahora);
    expect(entrada.feedingMaterialKind).toBeNull();
  });

  it("las colonias, el tipo y los días se leen como antes", () => {
    const entrada = leerManejoEnLote(
      formulario({
        apiaryId: "a1",
        colonyIds: ["c1", "", "c2"],
        eventType: "treatment",
        occurredAt: "2026-09-03",
        coverageUntil: "2026-09-10",
        treatmentDose: "abc",
      }),
      ahora,
    );
    expect(entrada.apiaryId).toBe("a1");
    expect(entrada.colonyIds).toEqual(["c1", "c2"]);
    expect(entrada.eventType).toBe("treatment");
    // Días, no instantes: medianoche UTC (ADR-112).
    expect(entrada.occurredAt?.toISOString()).toBe("2026-09-03T00:00:00.000Z");
    expect(entrada.coverageUntil?.toISOString()).toBe("2026-09-10T00:00:00.000Z");
    // Un número que no es número no se inventa: queda vacío.
    expect(entrada.treatmentDose).toBeNull();
  });

  it("sin día, el evento es de ahora", () => {
    const entrada = leerManejoEnLote(formulario({ colonyIds: ["c1"], eventType: "feeding" }), ahora);
    expect(entrada.occurredAt).toEqual(ahora);
  });
});
