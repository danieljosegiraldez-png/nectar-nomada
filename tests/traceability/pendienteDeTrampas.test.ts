/**
 * Hermética: sin base y sin reloj («hoy» entra como cadena). No va al grupo
 * `base-sembrada`; la corre el carril hermético de `scripts/ci.sh`.
 */
import { describe, expect, it } from "vitest";
import {
  avisosDeTrampas,
  estadoDeTrampa,
  ordenDeRonda,
  proximaRevisionDe,
  trampasFiltradas,
  trampasParaAviso,
  type EstadoDeTrampa,
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

  /**
   * A12 fix-final (M5) — activa, con regla, sin `instaladaEl` NI ninguna
   * revisión: no hay desde dónde contar el plazo. Antes de este arreglo caía
   * en `al_dia`, el mismo estado que una trampa genuinamente revisada a
   * tiempo (ADR-080: la ausencia de dato no se lee como «todo bien»).
   */
  it("activa, con regla, pero sin instalación ni revisiones: sin_base, no al_dia", () => {
    const trampa: TrampaParaAviso = { ...trampaBase, instaladaEl: null, ultimaRevision: null };
    expect(estadoDeTrampa({ hoy: "2026-09-18", trampa, regla }).estado).toBe("sin_base");
    expect(estadoDeTrampa({ hoy: "2026-09-18", trampa, regla }).diasDeRetraso).toBeNull();
  });

  // Control positivo del caso de arriba: con instalación registrada (todo lo
  // demás igual), la misma trampa SÍ tiene base y cae en `al_dia`, no en
  // `sin_base` — si `sin_base` apareciera siempre, esta prueba lo vería.
  it("con instalación registrada, la misma trampa sin revisiones es al_dia, no sin_base", () => {
    const trampa: TrampaParaAviso = { ...trampaBase, instaladaEl: "2026-09-01", ultimaRevision: null };
    expect(estadoDeTrampa({ hoy: "2026-09-10", trampa, regla }).estado).toBe("al_dia");
  });
});

/**
 * El filtro de `/finca/trampas` — Fix round 1, Tarea 8. Pura: recibe la lista
 * ya con su `estado`, así que no necesita `hoy` ni la regla.
 */
describe("trampasFiltradas", () => {
  const filas = [
    { id: "a", estado: "al_dia" as const },
    { id: "b", estado: "toca_revisar" as const },
    { id: "c", estado: "lectura_alta" as const },
    { id: "d", estado: "retirada" as const },
    { id: "e", estado: "sin_regla" as const },
  ];
  const ids = (r: typeof filas) => r.map((f) => f.id);

  it("«toca_revisar» deja sólo las que están en ese estado", () => {
    expect(ids(trampasFiltradas(filas, "toca_revisar"))).toEqual(["b"]);
  });

  it("«lectura_alta» deja sólo las que están en ese estado", () => {
    expect(ids(trampasFiltradas(filas, "lectura_alta"))).toEqual(["c"]);
  });

  it("sin filtro (undefined) devuelve todas, en el mismo orden", () => {
    expect(ids(trampasFiltradas(filas, undefined))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("un filtro vacío devuelve todas", () => {
    expect(ids(trampasFiltradas(filas, ""))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("un filtro desconocido devuelve todas — nunca una tabla vacía por una URL escrita a mano", () => {
    expect(ids(trampasFiltradas(filas, "algo-que-no-existe"))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("null también cuenta como ausente", () => {
    expect(ids(trampasFiltradas(filas, null))).toEqual(["a", "b", "c", "d", "e"]);
  });
});

/**
 * El orden de la ronda — Tarea 9, spec §4.2. Pura: recibe la lista ya con su
 * `estadoActual` calculado (por `estadoDeTrampa`), como `ordenDeRonda` la
 * consume en `/finca/trampas/ronda`.
 */
describe("ordenDeRonda", () => {
  const trampa = (n: number, estado: EstadoDeTrampa, dias: number | null) => ({
    id: `t${n}`, trapNumber: n, plotId: "p", plotName: "P", bloque: null,
    status: "active" as const, ultimaRevision: null, instaladaEl: null,
    estadoActual: { estado, diasDeRetraso: dias },
  });

  it("las vencidas van primero, ordenadas por más días de retraso", () => {
    const orden = ordenDeRonda([
      trampa(1, "al_dia", null),
      trampa(2, "toca_revisar", 2),
      trampa(3, "toca_revisar", 5),
      trampa(4, "lectura_alta", 0),
    ]);
    expect(orden.map((t) => t.trapNumber)).toEqual([3, 2, 4, 1]);
  });

  it("dentro de un mismo grupo, por número de trampa", () => {
    const orden = ordenDeRonda([trampa(5, "al_dia", null), trampa(2, "al_dia", null)]);
    expect(orden.map((t) => t.trapNumber)).toEqual([2, 5]);
  });

  // Contraejemplo de la revisión: «toca hoy» (al_dia con diasDeRetraso === 0)
  // es su propia franja, distinta de «al_dia» con días negativos (no vence
  // todavía). Antes del fix, las dos caían en el mismo grupo «no urgente» y
  // #2 ganaba por número de trampa — el spec exige lo contrario.
  it("toca hoy va antes que una que no vence en varios días (contraejemplo de revisión)", () => {
    const orden = ordenDeRonda([trampa(2, "al_dia", -5), trampa(9, "al_dia", 0)]);
    expect(orden.map((t) => t.trapNumber)).toEqual([9, 2]);
  });

  it("las tres franjas juntas: vencida, toca hoy, y el resto (incluye sin_regla)", () => {
    const orden = ordenDeRonda([
      trampa(8, "sin_regla", null),
      trampa(5, "al_dia", 0),
      trampa(1, "toca_revisar", 3),
    ]);
    expect(orden.map((t) => t.trapNumber)).toEqual([1, 5, 8]);
  });
});

/**
 * «próxima revisión» — Tarea 9, spec §4.2: «calculada con la regla. Sin
 * regla, la próxima revisión no se muestra, porque no hay valor por
 * defecto» (ADR-080). Comparte `plazoDeLaTrampa` con `disparoYPlazo`, así
 * que hereda el mismo `desde` (última revisión vigente o instalación) y el
 * mismo plazo (de alerta si la última lectura disparó).
 */
describe("proximaRevisionDe", () => {
  const trampaBase: TrampaParaAviso = {
    id: "t1", trapNumber: 1, bloque: null, status: "active",
    ultimaRevision: null, instaladaEl: "2026-09-01",
  };
  const regla: ReglaParaAviso = {
    triggerLevel: "algunos", normalDays: 15, alertDays: 7, suggestedAction: "aplicar cebo",
  };

  it("sin regla no hay próxima revisión: no hay valor por defecto", () => {
    expect(proximaRevisionDe(trampaBase, null)).toBeNull();
  });

  it("nunca revisada: el plazo normal cuenta desde la instalación", () => {
    expect(proximaRevisionDe(trampaBase, regla)).toBe("2026-09-16");
  });

  it("revisada: el plazo normal cuenta desde la última revisión", () => {
    const trampa: TrampaParaAviso = {
      ...trampaBase,
      ultimaRevision: { dia: "2026-09-10", brocaLevel: "pocos" },
    };
    expect(proximaRevisionDe(trampa, regla)).toBe("2026-09-25");
  });

  it("una lectura que dispara usa el plazo de alerta, más corto", () => {
    const trampa: TrampaParaAviso = {
      ...trampaBase,
      ultimaRevision: { dia: "2026-09-10", brocaLevel: "muchos" },
    };
    expect(proximaRevisionDe(trampa, regla)).toBe("2026-09-17");
  });

  it("sin revisión y sin instalación registrada no inventa una fecha", () => {
    expect(proximaRevisionDe({ ...trampaBase, instaladaEl: null }, regla)).toBeNull();
  });

  it("cruza un mes sin cruzar año: instalada el 20 de enero, el plazo normal (15 días) da el 4 de febrero", () => {
    const trampa: TrampaParaAviso = { ...trampaBase, instaladaEl: "2026-01-20" };
    expect(proximaRevisionDe(trampa, regla)).toBe("2026-02-04");
  });

  it("cruza un año: última revisión el 25 de diciembre con un plazo normal de 14 días da el 8 de enero", () => {
    const trampa: TrampaParaAviso = {
      ...trampaBase,
      ultimaRevision: { dia: "2026-12-25", brocaLevel: "pocos" },
    };
    const reglaDeCatorce: ReglaParaAviso = { ...regla, normalDays: 14 };
    expect(proximaRevisionDe(trampa, reglaDeCatorce)).toBe("2027-01-08");
  });
});
