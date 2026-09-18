/**
 * Hermética: sin base y sin reloj («hoy» entra como cadena). No va al grupo
 * `base-sembrada`; la corre el carril hermético de `scripts/ci.sh`.
 */
import { describe, expect, it } from "vitest";
import {
  avisosDeTrampas,
  estadoDeTrampa,
  trampasParaAviso,
  type ReglaParaAviso,
  type TrampaParaAviso,
} from "../../lib/traceability/pendienteDeTrampas";

const REGLA = { triggerLevel: "algunos" as const, normalDays: 14, alertDays: 7, suggestedAction: "aplicar Bralic" };
const activa = (extra: Partial<Parameters<typeof avisosDeTrampas>[0]["trampas"][number]> = {}) => ({
  id: "t1", trapNumber: 7, bloque: { name: "Norte", blockType: null }, status: "active" as const,
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

  // F7 fix-final — escenario de Codex: instalada el 1 de enero, retirada el 2
  // de enero, reinstalada el 18 de septiembre. Sin el arreglo, la lectura alta
  // de antes del retiro seguía proponiendo "aplicar Bralic" y el plazo corría
  // desde el 1 de enero, así que una trampa reinstalada HOY aparecía vencida
  // por meses el mismo día que se puso de nuevo en el suelo.
  it("el plazo corre desde la reinstalación, e ignora una lectura alta de antes del retiro", () => {
    const t = activa({
      instaladaEl: "2026-09-18", // la reinstalación, no la instalación original (1 de enero)
      ultimaRevision: { dia: "2026-01-01", brocaLevel: "muchos" },
    });
    expect(avisosDeTrampas({ hoy: "2026-09-18", trampas: [t], regla: REGLA })).toEqual([]);
  });
});

describe("entrada de los avisos desde getPlotDetail", () => {
  // `observedAt` es un campo de día: medianoche UTC.
  const cruda = (ultimaRevision: { observedAt: Date; brocaLevel: "muchos" | null } | null) => ({
    id: "t1", trapNumber: 7, bloque: { name: "Norte", blockType: null }, status: "active" as const,
    instaladaEl: new Date("2026-09-01T00:00:00Z"), ultimaRevision,
  });

  it("convierte los dos días a YYYY-MM-DD", () => {
    const [t] = trampasParaAviso([cruda({ observedAt: new Date("2026-09-10T00:00:00Z"), brocaLevel: "muchos" })]);
    expect(t).toEqual({
      id: "t1", trapNumber: 7, bloque: { name: "Norte", blockType: null }, status: "active",
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

describe("estadoDeTrampa", () => {
  const trampaBase: TrampaParaAviso = {
    id: "t1", trapNumber: 1, bloque: null, status: "active",
    ultimaRevision: null, instaladaEl: "2026-09-01",
  };
  const regla: ReglaParaAviso = {
    triggerLevel: "algunos", normalDays: 15, alertDays: 7, suggestedAction: "aplicar cebo",
  };

  it("sin regla, el estado es sin_regla", () => {
    expect(estadoDeTrampa({ hoy: "2026-09-18", trampa: trampaBase, regla: null }).estado).toBe(
      "sin_regla",
    );
  });

  it("dentro del plazo normal, al_dia", () => {
    expect(
      estadoDeTrampa({ hoy: "2026-09-10", trampa: trampaBase, regla }).estado,
    ).toBe("al_dia");
  });

  it("pasado el plazo normal sin revisión, toca_revisar", () => {
    const r = estadoDeTrampa({ hoy: "2026-09-20", trampa: trampaBase, regla });
    expect(r.estado).toBe("toca_revisar");
    expect(r.diasDeRetraso).toBeGreaterThan(0);
  });

  it("una lectura que dispara es lectura_alta, aunque esté dentro del plazo", () => {
    const trampa: TrampaParaAviso = {
      ...trampaBase,
      ultimaRevision: { dia: "2026-09-17", brocaLevel: "muchos" },
    };
    expect(estadoDeTrampa({ hoy: "2026-09-18", trampa, regla }).estado).toBe("lectura_alta");
  });

  it("una trampa retirada dice que está retirada, no que falta la regla (ADR-080)", () => {
    expect(
      estadoDeTrampa({ hoy: "2026-09-18", trampa: { ...trampaBase, status: "removed" }, regla })
        .estado,
    ).toBe("retirada");
    expect(
      estadoDeTrampa({ hoy: "2026-09-18", trampa: { ...trampaBase, status: "removed" }, regla: null })
        .estado,
    ).toBe("retirada");
  });
});
