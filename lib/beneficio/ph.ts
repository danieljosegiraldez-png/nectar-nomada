/**
 * ¿Qué está haciendo la fermentación de este lote, según su pH?
 *
 * **El motor `PHMonitor` de `docs/beneficio/10_ph_fermentation.md`**, portado a
 * TypeScript porque aquí no hay Python — 0 archivos `.py` contra 467 `.ts`, y el
 * §1 del propio paquete ya contempla «interfaces explícitas en TypeScript».
 *
 * ## Las cuatro cosas que esta versión arregla de la anterior
 *
 * 1. **No lanza nunca ante una lectura fuera de rango.** La v2.5 hacía
 *    `raise ValueError`, así que **un electrodo sucio derribaba la ingesta
 *    entera**. Un sistema de campo se degrada; no se cae. Devuelve `SENSOR_FAULT`.
 * 2. **La banda `[3.50, 3.80)` ya no es muda.** Antes caía en el `return` final
 *    como `MONITORING`, sin aviso, **en la única ventana donde el lote todavía
 *    se puede salvar**. Era el hueco lógico más caro de la especificación.
 * 3. **Las fronteras son semiabiertas `[inf, sup)`.** En v2.5 un pH de 4,50
 *    satisfacía «ventana óptima» y «estancado» a la vez, y **el orden de los
 *    `if` decidía en silencio**.
 * 4. **Existe la meseta cinética.** Una fermentación detenida en pH 4,20 es tan
 *    peligrosa como una detenida en 4,70, y la v2.5 sólo veía la segunda. Mirar
 *    el nivel no basta: hay que mirar si se mueve.
 *
 * ## Contrato de retorno congelado
 *
 * `PHAssessment` lleva **todos** sus campos en **toda** ruta de ejecución. La
 * v2.5 devolvía diccionarios de forma variable —`velocity_bx_hr` presente en una
 * rama y ausente en otra— que es un `KeyError` en quien consume, y justo en el
 * evento más importante del ciclo.
 *
 * ## Lo que este archivo NO decide
 *
 * **Ningún umbral vive aquí.** Todos salen de `ProtocolProfile`, y todos son
 * `[PROVISIONAL]` hasta que Daniel los revise — decisión **P-F**. El motor es
 * **asesor, no autónomo**: `STALLED_ROT_HAZARD` y `OVER_FERMENTED_CRITICAL`
 * *recomiendan*; mandar un lote a lavado lo confirma una persona.
 */

import {
  PH_CONFIRM_MAX_H,
  PH_CONFIRM_MIN_H,
  PH_INITIAL_PHASE_FLOOR,
  PH_PHYSICAL_MAX,
  PH_PHYSICAL_MIN,
  PLATEAU_EPSILON,
  RECENT_WINDOW_H,
  type ProtocolProfile,
} from "./perfiles";

const HORA = 3_600_000;

export type Severity = "INFO" | "WARNING" | "CRITICAL";

/**
 * Qué tan de fiar es una lectura. `UNCALIBRATED` **se persiste pero no alimenta
 * ninguna alerta**: una alerta construida sobre una lectura sin calibración
 * vigente es una decisión de aspecto profesional y contenido falso.
 */
export type DataConfidence =
  | "VALIDATED"
  | "TEMP_UNCOMPENSATED"
  | "TEMP_DRIFT_RISK"
  | "RETROSPECTIVE"
  /**
   * **Añadido el 2026-09-14 por decisión de Daniel, y extiende la §5 de
   * `docs/beneficio/02_calibration.md`.**
   *
   * El instrumento pasó su contraste contra patrón, pero hace más tiempo del que
   * su propio plazo de aviso admite. Su regla: *«un instrumento se vence y se
   * puede seguir usando como indica su protocolo o decisión personal pero sí se
   * alerta y queda explícito que no está revisado»*.
   *
   * **Ninguno de los cuatro valores anteriores podía decir eso.** `UNCALIBRATED`
   * lo excluiría del cálculo —y él dijo que se sigue usando—; los tres del medio
   * hablan de temperatura y de retraso de captura, no de revisión. Colgar este
   * estado de una etiqueta que significa otra cosa habría vuelto ilegible la que
   * ya existía.
   *
   * Cae del lado usable: alimenta curvas y puede generar `WARNING`, y **no puede
   * confirmar una `CRITICAL`**, que es lo que la histéresis reserva a `VALIDATED`.
   */
  | "REVISION_VENCIDA"
  | "UNCALIBRATED";

export type PHStatus =
  | "DATA_INSUFFICIENT"
  | "SENSOR_FAULT"
  | "SUSPECT_DILUTION"
  | "INITIAL_PHASE"
  | "LAG_PHASE"
  | "STALLED_ROT_HAZARD"
  | "STALL_SUSPENDED_COLD_HOLD"
  | "KINETIC_PLATEAU"
  | "OPTIMAL_ACTIVE"
  | "WATCH_APPROACHING_LOW"
  | "OVER_FERMENTED_CRITICAL";

export interface PHReading {
  readonly ph: number;
  readonly measuredAt: Date;
  readonly confidence: DataConfidence;
  /** Una corrección supersede a la original; la original no se borra. */
  readonly supersededAt?: Date | null;
}

export interface PHAssessment {
  readonly status: PHStatus;
  readonly severity: Severity;
  /** Clave i18n con sus parámetros. **Nunca** texto en español: eso vive en `messages/`. */
  readonly alertKey: string | null;
  readonly currentPh: number | null;
  readonly hoursElapsed: number;
  /** Pendiente de las últimas 6 h, sólo informativa. `null` si no se puede calcular. */
  readonly dphDtRecent: number | null;
  readonly dphDtCumulative: number | null;
  readonly confidence: DataConfidence;
  readonly readingsUsed: number;
  readonly awaitingConfirmation: boolean;
  readonly warnings: readonly string[];
}

/** Horas entre dos instantes. */
const horasEntre = (desde: Date, hasta: Date): number => (hasta.getTime() - desde.getTime()) / HORA;

/**
 * Pendiente en pH/h sobre una ventana, o `null` si no se puede calcular.
 *
 * **Con guarda de cero, y no es teórica**: dos lecturas con el mismo
 * `measuredAt` —que ocurre al capturar dos muestras a la vez— darían una
 * división por cero. `null` dice «no se sabe», que es distinto de «vale 0».
 */
function pendiente(serie: readonly PHReading[], desde: Date, hasta: Date): number | null {
  const ventana = serie.filter(
    (r) => r.measuredAt.getTime() >= desde.getTime() && r.measuredAt.getTime() <= hasta.getTime(),
  );
  if (ventana.length < 2) return null;
  const primera = ventana[0]!;
  const ultima = ventana[ventana.length - 1]!;
  const horas = horasEntre(primera.measuredAt, ultima.measuredAt);
  if (horas <= 0) return null;
  return Math.round(((ultima.ph - primera.ph) / horas) * 10_000) / 10_000;
}

/**
 * La regla de histéresis de `00_conventions.md` §9: **dos lecturas consecutivas
 * `VALIDATED`** que cumplan la condición, separadas por un intervalo dentro de
 * la ventana de este motor (15 min – 4 h).
 *
 * **Por qué existe.** Una alerta que ordena lavar un lote tiene coste operativo
 * real y no puede nacer de una sola lectura. La excepción es el disparo
 * inmediato: por debajo de `phImmediateLow` el daño ya ocurrió y esperar agrava.
 */
function confirmada(serie: readonly PHReading[], cumple: (r: PHReading) => boolean): boolean {
  const ultimas = serie.slice(-2);
  const aciertos = ultimas.filter(cumple);
  if (aciertos.length < 2) return false;
  const separacion = horasEntre(aciertos[0]!.measuredAt, aciertos[1]!.measuredAt);
  return (
    separacion >= PH_CONFIRM_MIN_H &&
    separacion <= PH_CONFIRM_MAX_H &&
    aciertos.every((r) => r.confidence === "VALIDATED")
  );
}

interface Contexto {
  readonly ultima: PHReading;
  readonly horas: number;
  readonly reciente: number | null;
  readonly acumulada: number | null;
  readonly usadas: number;
}

/** El constructor único del contrato: ninguna rama puede olvidarse un campo. */
function evaluacion(
  status: PHStatus,
  severity: Severity,
  alertKey: string | null,
  ctx: Contexto,
  extras: { awaitingConfirmation?: boolean; warnings?: readonly string[] } = {},
): PHAssessment {
  return {
    status,
    severity,
    alertKey,
    currentPh: ctx.ultima.ph,
    hoursElapsed: ctx.horas,
    dphDtRecent: ctx.reciente,
    dphDtCumulative: ctx.acumulada,
    confidence: ctx.ultima.confidence,
    readingsUsed: ctx.usadas,
    awaitingConfirmation: extras.awaitingConfirmation ?? false,
    warnings: extras.warnings ?? [],
  };
}

export function evaluarPh(input: {
  readings: readonly PHReading[];
  fermentationStartedAt: Date;
  now: Date;
  profile: ProtocolProfile;
}): PHAssessment {
  const { readings, fermentationStartedAt, now, profile: p } = input;

  // Sin calibración vigente no alimenta la alerta, y una corrección deja fuera
  // a la original. Las dos siguen persistidas: esto filtra el cálculo, no el dato.
  const usables = readings.filter((r) => r.confidence !== "UNCALIBRATED" && !r.supersededAt);
  const horas = horasEntre(fermentationStartedAt, now);

  if (usables.length === 0) {
    return {
      status: "DATA_INSUFFICIENT",
      severity: "INFO",
      alertKey: null,
      currentPh: null,
      hoursElapsed: horas,
      dphDtRecent: null,
      dphDtCumulative: null,
      confidence: "UNCALIBRATED",
      readingsUsed: 0,
      awaitingConfirmation: false,
      warnings: [],
    };
  }

  const serie = [...usables].sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  const ultima = serie[serie.length - 1]!;
  const ctx: Contexto = {
    ultima,
    horas,
    reciente: pendiente(serie, new Date(now.getTime() - RECENT_WINDOW_H * HORA), now),
    acumulada: pendiente(serie, fermentationStartedAt, now),
    usadas: serie.length,
  };

  // Se reporta, no se lanza. Un electrodo sucio no puede derribar la ingesta.
  if (ultima.ph < PH_PHYSICAL_MIN || ultima.ph > PH_PHYSICAL_MAX) {
    return evaluacion("SENSOR_FAULT", "WARNING", "alert.ph.sensor_fault", ctx);
  }

  // **Ya no hay aviso de dilución con un pH fijo** (ADR-181 #13, decisión de Daniel del
  // 2026-09-19; retirado del motor el 2026-10-08). El 6,50 decía «el mucílago no pasa de ~6,0»,
  // pero el agua de la finca mide 6,5–6,9 y hay aguas de 7–8: el mosto se comparará contra el pH
  // del AGUA DE ESE LOTE cuando exista esa medición. Hasta entonces un pH alto al empezar es fase
  // inicial. `SUSPECT_DILUTION` sigue declarado para entonces; hoy no lo emite nadie.

  if (ultima.ph < p.phImmediateLow) {
    return evaluacion("OVER_FERMENTED_CRITICAL", "CRITICAL", "alert.ph.over_fermented_immediate", ctx);
  }

  if (ultima.ph < p.phCriticalLow) {
    const ok = confirmada(serie, (r) => r.ph < p.phCriticalLow);
    return evaluacion("OVER_FERMENTED_CRITICAL", ok ? "CRITICAL" : "WARNING", "alert.ph.over_fermented", ctx, {
      awaitingConfirmation: !ok,
    });
  }

  // Reposo frío declarado: la meseta es el objetivo del protocolo, no una avería.
  const vigilaEstancamiento = horas > p.stallSuspendedUntilHours;
  if (!vigilaEstancamiento) {
    return evaluacion("STALL_SUSPENDED_COLD_HOLD", "INFO", null, ctx);
  }

  if (ultima.ph >= p.phOptimalHigh && horas >= p.phStallGraceHours) {
    const ok = confirmada(serie, (r) => r.ph >= p.phOptimalHigh);
    return evaluacion("STALLED_ROT_HAZARD", ok ? "CRITICAL" : "WARNING", "alert.ph.stalled_rot_hazard", ctx, {
      awaitingConfirmation: !ok,
    });
  }

  // La meseta dentro de la ventana óptima — lo nuevo de la v3.0.
  const enLaGracia = pendiente(serie, new Date(now.getTime() - p.phStallGraceHours * HORA), now);
  if (enLaGracia !== null && Math.abs(enLaGracia) < PLATEAU_EPSILON && horas >= p.phStallGraceHours) {
    return evaluacion("KINETIC_PLATEAU", "WARNING", "alert.ph.kinetic_plateau", ctx);
  }

  if (ultima.ph >= p.phCriticalLow && ultima.ph < p.phOptimalLow) {
    return evaluacion("WATCH_APPROACHING_LOW", "WARNING", "alert.ph.approaching_low", ctx);
  }

  if (ultima.ph >= p.phOptimalLow && ultima.ph < p.phOptimalHigh) {
    return evaluacion("OPTIMAL_ACTIVE", "INFO", null, ctx);
  }

  if (ultima.ph >= PH_INITIAL_PHASE_FLOOR) {
    return evaluacion("INITIAL_PHASE", "INFO", null, ctx);
  }

  return evaluacion("LAG_PHASE", "INFO", null, ctx);
}
