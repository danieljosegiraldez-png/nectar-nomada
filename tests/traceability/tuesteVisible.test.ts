import { describe, expect, it } from "vitest";
import { SensorySessionStatus } from "../../generated/prisma/enums";
import { SESIONES_CERRADAS, tuesteVisible } from "../../lib/traceability/tuesteVisible";

/**
 * ADR-043 — el informe de un lote sólo dice qué tueste se cató cuando la cata ya no es ciega.
 * Ver `lib/traceability/tuesteVisible.ts` para el porqué (Bob es Farm Manager y Sensory Judge).
 */
const cerrados = SESIONES_CERRADAS as readonly string[];
const abiertos = Object.values(SensorySessionStatus).filter((s) => !cerrados.includes(s));

describe("tuesteVisible", () => {
  it("fija los estados: uno nuevo en el enum obliga a decidir si es abierto o cerrado", () => {
    // Si se añade un estado a `SensorySessionStatus` esta lista deja de coincidir y alguien
    // tiene que decidir, a propósito, de qué lado cae. Sin esto un estado nuevo cae por omisión
    // del lado que revela.
    expect([...abiertos].sort()).toEqual(["blind_coding", "draft", "in_progress"]);
    expect([...cerrados].sort()).toEqual(["completed", "locked"]);
  });

  it("una cata abierta y sin revelar NO lo dice", () => {
    for (const estado of abiertos) expect(tuesteVisible(false, estado), estado).toBe(false);
  });

  it("un mapeo revelado lo dice aunque la sesión siga abierta", () => {
    for (const estado of abiertos) expect(tuesteVisible(true, estado), estado).toBe(true);
  });

  it("una sesión cerrada lo dice, esté revelado el mapeo o no", () => {
    for (const estado of cerrados) {
      expect(tuesteVisible(false, estado), estado).toBe(true);
      expect(tuesteVisible(true, estado), estado).toBe(true);
    }
  });

  it("un estado desconocido NO lo dice: ante la duda, ciego", () => {
    expect(tuesteVisible(false, "estado_que_no_existe")).toBe(false);
  });
});
