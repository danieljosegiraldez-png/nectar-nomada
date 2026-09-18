/**
 * Hermética: sin base y sin reloj («hoy» entra como cadena). No va al grupo
 * `base-sembrada`; la corre el carril hermético de `scripts/ci.sh`.
 */
import { describe, expect, it } from "vitest";
import { avisosDeTrampas, trampasParaAviso } from "../../lib/traceability/pendienteDeTrampas";

const REGLA = { triggerLevel: "algunos" as const, normalDays: 14, alertDays: 7, suggestedAction: "aplicar Bralic" };
const activa = (extra: Partial<Parameters<typeof avisosDeTrampas>[0]["trampas"][number]> = {}) => ({
  id: "t1", trapNumber: 7, bloque: "Norte", status: "active" as const,
  ultimaRevision: null, instaladaEl: "2026-09-01", ...extra,
});

describe("avisos de trampas", () => {
  it("sin regla no avisa de nada, por vencida que esté", () => {
    const avisos = avisosDeTrampas({ hoy: "2026-12-31", trampas: [activa()], regla: null });
    expect(avisos).toEqual([]);
  });

  it("cuenta el plazo normal desde la instalación cuando nunca se revisó", () => {
    const avisos = avisosDeTrampas({ hoy: "2026-09-16", trampas: [activa()], regla: REGLA });
    expect(avisos).toEqual([
      { tipo: "trampa_por_revisar", specimenId: "t1", trapNumber: 7, diasDeRetraso: 1 },
    ]);
  });

  it("el día exacto del vencimiento todavía no avisa", () => {
    const avisos = avisosDeTrampas({ hoy: "2026-09-15", trampas: [activa()], regla: REGLA });
    expect(avisos).toEqual([]);
  });

  it("usa el plazo de alerta cuando la última lectura disparó", () => {
    const t = activa({ ultimaRevision: { dia: "2026-09-10", brocaLevel: "muchos" } });
    const avisos = avisosDeTrampas({ hoy: "2026-09-18", trampas: [t], regla: REGLA });
    expect(avisos.map((a) => a.tipo)).toContain("trampa_por_revisar");
  });

  it("propone la acción de la regla cuando la lectura disparó", () => {
    const t = activa({ ultimaRevision: { dia: "2026-09-16", brocaLevel: "algunos" } });
    const avisos = avisosDeTrampas({ hoy: "2026-09-17", trampas: [t], regla: REGLA });
    expect(avisos).toContainEqual({
      tipo: "trampa_con_lectura_alta", specimenId: "t1", trapNumber: 7,
      lectura: "algunos", accion: "aplicar Bralic",
    });
  });

  it("una lectura por debajo del disparador no propone nada", () => {
    const t = activa({ ultimaRevision: { dia: "2026-09-16", brocaLevel: "pocos" } });
    const avisos = avisosDeTrampas({ hoy: "2026-09-17", trampas: [t], regla: REGLA });
    expect(avisos.map((a) => a.tipo)).not.toContain("trampa_con_lectura_alta");
  });

  it("una trampa retirada no genera avisos", () => {
    const t = activa({ status: "removed", ultimaRevision: { dia: "2026-01-01", brocaLevel: "muchos" } });
    expect(avisosDeTrampas({ hoy: "2026-09-17", trampas: [t], regla: REGLA })).toEqual([]);
  });
});

describe("entrada de los avisos desde getPlotDetail", () => {
  // `observedAt` es un campo de día: medianoche UTC.
  const cruda = (ultimaRevision: { observedAt: Date; brocaLevel: "muchos" | null } | null) => ({
    id: "t1", trapNumber: 7, bloque: "Norte", status: "active" as const,
    instaladaEl: new Date("2026-09-01T00:00:00Z"), ultimaRevision,
  });

  it("convierte los dos días a YYYY-MM-DD", () => {
    const [t] = trampasParaAviso([cruda({ observedAt: new Date("2026-09-10T00:00:00Z"), brocaLevel: "muchos" })]);
    expect(t).toEqual({
      id: "t1", trapNumber: 7, bloque: "Norte", status: "active",
      instaladaEl: "2026-09-01", ultimaRevision: { dia: "2026-09-10", brocaLevel: "muchos" },
    });
  });

  it("una revisión sin lectura NO se descarta: el plazo corre desde su día", () => {
    const trampas = trampasParaAviso([cruda({ observedAt: new Date("2026-09-10T00:00:00Z"), brocaLevel: null })]);
    expect(trampas[0]!.ultimaRevision).toEqual({ dia: "2026-09-10", brocaLevel: null });
    // Desde la revisión van 10 días (< 14). Desde la instalación irían 19: si
    // se descartara la revisión, esto avisaría con 5 días de retraso.
    expect(avisosDeTrampas({ hoy: "2026-09-20", trampas, regla: REGLA })).toEqual([]);
  });

  it("una revisión sin lectura cuenta como «no disparó»: plazo normal y sin acción", () => {
    const trampas = trampasParaAviso([cruda({ observedAt: new Date("2026-09-10T00:00:00Z"), brocaLevel: null })]);
    // 15 días desde la revisión: 1 de retraso con el plazo normal (14); con el
    // de alerta (7) serían 8.
    expect(avisosDeTrampas({ hoy: "2026-09-25", trampas, regla: REGLA })).toEqual([
      { tipo: "trampa_por_revisar", specimenId: "t1", trapNumber: 7, diasDeRetraso: 1 },
    ]);
  });

  it("sin revisión y sin instalación registrada no inventa un plazo", () => {
    const trampas = trampasParaAviso([{ ...cruda(null), instaladaEl: null }]);
    expect(trampas[0]!.instaladaEl).toBeNull();
    expect(avisosDeTrampas({ hoy: "2026-12-31", trampas, regla: REGLA })).toEqual([]);
  });
});
