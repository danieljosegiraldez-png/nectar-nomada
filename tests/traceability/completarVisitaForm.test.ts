import { describe, expect, it } from "vitest";
import { leerCompletarVisita } from "../../lib/traceability/completarVisitaForm";

/**
 * Cerrar una visita NO borra lo que ya se anotó (revisión de Apiario del 2026-10-08, V-1).
 *
 * El formulario de cierre llega con colonias, cajas, clima y notas vacíos, porque no trae lo que
 * se anotó estando en el sitio ni las notas de cuando se abrió la visita. Hasta hoy la acción
 * convertía ese vacío en `null`, y `completarVisita` —que sólo deja quieto lo `undefined`— lo
 * escribía encima: los vitales de campo y las notas de inicio se perdían al cerrar, con sólo su
 * «antes» en la auditoría. Las pruebas del servicio pasan `undefined` y no podían verlo.
 *
 * Es una prueba sin base a propósito: el defecto vive en cómo se lee el formulario, no en el
 * servicio.
 */
function formulario(campos: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [clave, valor] of Object.entries(campos)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) f.append(clave, v);
  }
  return f;
}

describe("leerCompletarVisita — el vacío del cierre no borra lo anotado", () => {
  it("colonias, cajas, clima y notas vacíos quedan SIN TOCAR (undefined), no en null", () => {
    const entrada = leerCompletarVisita(
      formulario({ fieldSessionId: "v1", coloniesAliveCount: "", hivesPresentCount: "", weatherObserved: "", notes: "" }),
    );
    expect(entrada.coloniesAliveCount).toBeUndefined();
    expect(entrada.hivesPresentCount).toBeUndefined();
    expect(entrada.weatherObserved).toBeUndefined();
    expect(entrada.notes).toBeUndefined();
  });

  it("un cero sigue siendo cero: un apiario vaciado se cuenta (ADR-080)", () => {
    const entrada = leerCompletarVisita(formulario({ fieldSessionId: "v1", coloniesAliveCount: "0", hivesPresentCount: "0" }));
    expect(entrada.coloniesAliveCount).toBe(0);
    expect(entrada.hivesPresentCount).toBe(0);
  });

  it("lo que se escribe al cerrar sí corrige: valores y notas recortadas", () => {
    const entrada = leerCompletarVisita(
      formulario({
        fieldSessionId: "v1",
        coloniesAliveCount: " 8 ",
        hivesPresentCount: "10",
        weatherObserved: "soleado",
        notes: "  revisadas todas  ",
      }),
    );
    expect(entrada).toMatchObject({ fieldSessionId: "v1", coloniesAliveCount: 8, hivesPresentCount: 10, weatherObserved: "soleado", notes: "revisadas todas" });
  });

  it("los campos que sólo se anotan al cerrar conservan su regla: vacío es «no se anotó» (null)", () => {
    const entrada = leerCompletarVisita(
      formulario({ fieldSessionId: "v1", nextVisitDueAt: "", travelCostUsd: "", probableCause: "", recommendation: "", reason: "" }),
    );
    expect(entrada.nextVisitDueAt).toBeNull();
    expect(entrada.travelCostUsd).toBeNull();
    expect(entrada.probableCause).toBeNull();
    expect(entrada.recommendation).toBeNull();
    expect(entrada.reason).toBeNull();
  });

  it("la próxima visita es un DÍA: medianoche UTC, sin desfase del dispositivo", () => {
    const entrada = leerCompletarVisita(formulario({ fieldSessionId: "v1", nextVisitDueAt: "2026-10-15" }));
    expect(entrada.nextVisitDueAt?.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });

  it("sin casillas de condiciones NO se tocan; con casillas, se escriben con su nota", () => {
    expect(leerCompletarVisita(formulario({ fieldSessionId: "v1" })).siteConditions).toBeUndefined();
    const con = leerCompletarVisita(formulario({ fieldSessionId: "v1", siteConditions: ["lluvia", "otro"], siteConditionOtherNote: " viento " }));
    expect(con.siteConditions).toEqual(["lluvia", "otro"]);
    expect(con.siteConditionOtherNote).toBe("viento");
  });
});
