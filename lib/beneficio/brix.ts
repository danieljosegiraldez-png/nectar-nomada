/**
 * ¿Se están consumiendo los azúcares, o la fermentación se paró?
 *
 * **El motor `BrixKineticAnalyzer` de `docs/beneficio/11`**, portado a
 * TypeScript. Y aquí está **el defecto más grave de todo el paquete v2.x**:
 *
 * > La alerta de estancamiento estaba especificada en la §1 del documento **y**
 * > en su `CLAUDE.md`, y el código **no tenía ninguna rama que la emitiera**.
 * > Calculaba la velocidad y la devolvía sin evaluarla nunca.
 *
 * Una protección documentada que no existe es peor que no tenerla: quien lee el
 * documento da por hecho que el sistema avisa, y en producción no avisa jamás.
 *
 * ## Las cinco correcciones, y por qué cada una importa
 *
 * 1. **La velocidad se mide en ventana móvil, no como promedio de vida.** Un
 *    lote que consumió rápido las primeras 8 h y lleva 13 h detenido exhibe una
 *    velocidad acumulada saludable: **el promedio enmascara exactamente la
 *    condición que se quería detectar**. Se reportan las dos y se decide con la
 *    reciente.
 * 2. **La terminación es robusta a valores atípicos.** La v2.5 comparaba la
 *    primera lectura contra la última, así que **un enjuague de prisma mal hecho
 *    mandaba el lote a lavado antes de tiempo**. Ahora son medianas de tres.
 * 3. **Guarda de división por cero.** Un refractómetro sin cerar da `initial = 0`
 *    y la v2.5 hacía `(initial - current) / initial`: `ZeroDivisionError` y la
 *    ingesta al suelo.
 * 4. **No todo ascenso de °Bx es fraude.** La solubilización del mucílago sube
 *    el °Bx del licor **legítimamente** en las primeras horas. La regla de la
 *    v2.5 —marcar cualquier ascenso— generaba anomalías falsas en cada lote.
 * 5. **Una ventana de estancamiento no evaluable NO corta la evaluación.** Es el
 *    punto que más fácil se implementa mal: convertirla en estado terminal deja
 *    al motor incapaz de emitir `TERMINATION_READY` en casi cualquier cadencia
 *    real de muestreo.
 *
 * **Un °Bx no significa nada sin decir de qué se midió.** Licor de tanque y
 * mucílago exprimido dan valores sistemáticamente distintos y **no hay factor de
 * conversión defendible**: mezclarlos se rechaza, no se normaliza.
 */

import {
  BRIX_CONFIRM_MAX_H,
  BRIX_CONFIRM_MIN_H,
  BRIX_PHYSICAL_MAX,
  BRIX_PHYSICAL_MIN,
  MEDIAN_WINDOW,
  MIN_READINGS_FOR_MEDIAN,
  STALL_MATCH_TOLERANCE_H,
  type ProtocolProfile,
} from "./perfiles";
import type { DataConfidence, Severity } from "./ph";

const HORA = 3_600_000;

export type SamplePoint =
  | "TANK_LIQUID_MID"
  | "TANK_LIQUID_SURFACE"
  | "MUCILAGE_PRESSED"
  | "CHERRY_PULP"
  | "PARCHMENT_BED";

export type BrixStatus =
  | "DATA_INSUFFICIENT"
  | "SENSOR_FAULT"
  | "MIXED_SAMPLE_POINTS"
  | "STAGNATION_HAZARD"
  | "DATA_INTEGRITY_VIOLATION"
  | "TERMINATION_READY"
  | "FERMENTING";

export interface BrixReading {
  readonly brix: number;
  readonly measuredAt: Date;
  readonly confidence: DataConfidence;
  readonly samplePoint: SamplePoint;
  readonly supersededAt?: Date | null;
}

export interface BrixAssessment {
  readonly status: BrixStatus;
  readonly severity: Severity;
  readonly alertKey: string | null;
  /** Mediana robusta de las últimas tres, no la última cruda. */
  readonly currentBrix: number | null;
  readonly initialBrix: number | null;
  readonly totalDropPct: number | null;
  /** **La métrica de decisión**: pendiente de las últimas horas. */
  readonly velocityRecentBxH: number | null;
  /** Contexto informativo. Por sí sola esconde una parada. */
  readonly velocityCumulativeBxH: number | null;
  readonly hoursElapsed: number;
  readonly samplePoint: SamplePoint | null;
  readonly confidence: DataConfidence;
  readonly readingsUsed: number;
  readonly awaitingConfirmation: boolean;
  readonly warnings: readonly string[];
}

const horasEntre = (desde: Date, hasta: Date): number => (hasta.getTime() - desde.getTime()) / HORA;

const mediana = (xs: readonly number[]): number => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 === 1 ? o[m]! : (o[m - 1]! + o[m]!) / 2;
};

/**
 * Los extremos robustos de la serie.
 *
 * **La mediana se toma por CONTEO y no por ventana temporal.** Una ventana de
 * pocas horas colapsa a dos lecturas en cadencias espaciadas, y la mediana de
 * dos valores es su media — que no rechaza valores atípicos, que es justo para
 * lo que existe la regla.
 *
 * **Y sólo con al menos cuatro lecturas.** Con menos, los conjuntos inicial y
 * final se solapan e `initial` saldría igual a `current` **por construcción**,
 * dando siempre una caída del 0 %.
 */
function extremos(serie: readonly BrixReading[]): {
  initial: number;
  current: number;
  serieCorta: boolean;
} {
  if (serie.length < MIN_READINGS_FOR_MEDIAN) {
    return { initial: serie[0]!.brix, current: serie[serie.length - 1]!.brix, serieCorta: true };
  }
  const primeras = serie.slice(0, MEDIAN_WINDOW).map((r) => r.brix);
  const ultimas = serie.slice(-MEDIAN_WINDOW).map((r) => r.brix);
  return { initial: mediana(primeras), current: mediana(ultimas), serieCorta: false };
}

/** Pendiente en °Bx/h sobre una ventana, con guarda de cero. */
function pendiente(serie: readonly BrixReading[], desde: Date, hasta: Date): number | null {
  const v = serie.filter(
    (r) => r.measuredAt.getTime() >= desde.getTime() && r.measuredAt.getTime() <= hasta.getTime(),
  );
  if (v.length < 2) return null;
  const horas = horasEntre(v[0]!.measuredAt, v[v.length - 1]!.measuredAt);
  if (horas <= 0) return null;
  return Math.round(((v[v.length - 1]!.brix - v[0]!.brix) / horas) * 10_000) / 10_000;
}

/**
 * Histéresis del motor de Brix: dos lecturas consecutivas `VALIDATED` que
 * cumplen la condición, separadas entre 1 h y 8 h. La cadencia de muestreo de
 * este motor es más lenta que la del pH, y por eso su ventana es otra.
 */
function confirmada(serie: readonly BrixReading[], cumple: (r: BrixReading) => boolean): boolean {
  const dos = serie.slice(-2);
  if (dos.length < 2 || !dos.every(cumple)) return false;
  const sep = horasEntre(dos[0]!.measuredAt, dos[1]!.measuredAt);
  return (
    sep >= BRIX_CONFIRM_MIN_H &&
    sep <= BRIX_CONFIRM_MAX_H &&
    dos.every((r) => r.confidence === "VALIDATED")
  );
}

export function evaluarBrix(input: {
  readings: readonly BrixReading[];
  fermentationStartedAt: Date;
  now: Date;
  profile: ProtocolProfile;
}): BrixAssessment {
  const { readings, fermentationStartedAt, now, profile: p } = input;
  const horas = horasEntre(fermentationStartedAt, now);
  const usables = readings.filter((r) => r.confidence !== "UNCALIBRATED" && !r.supersededAt);

  const base = {
    hoursElapsed: horas,
    confidence: (usables[usables.length - 1]?.confidence ?? "UNCALIBRATED") as DataConfidence,
    readingsUsed: usables.length,
    awaitingConfirmation: false,
    currentBrix: null,
    initialBrix: null,
    totalDropPct: null,
    velocityRecentBxH: null,
    velocityCumulativeBxH: null,
    samplePoint: null,
    warnings: [] as readonly string[],
  } satisfies Omit<BrixAssessment, "status" | "severity" | "alertKey">;

  // Una sola lectura no describe una cinética: no hay pendiente que calcular.
  if (usables.length < 2) {
    return { ...base, status: "DATA_INSUFFICIENT", severity: "INFO", alertKey: null };
  }

  // Mezclar puntos de muestreo se RECHAZA, no se normaliza: no existe factor de
  // conversión defendible entre licor de tanque y mucílago exprimido.
  const puntos = new Set(usables.map((r) => r.samplePoint));
  if (puntos.size > 1) {
    return {
      ...base,
      status: "MIXED_SAMPLE_POINTS",
      severity: "WARNING",
      alertKey: "alert.brix.mixed_sample_points",
    };
  }

  const serie = [...usables].sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  const { initial, current, serieCorta } = extremos(serie);
  const avisos: string[] = serieCorta ? ["SHORT_SERIES_NO_MEDIAN"] : [];
  const punto = serie[0]!.samplePoint;

  const conDatos = {
    ...base,
    currentBrix: current,
    initialBrix: initial,
    samplePoint: punto,
    confidence: serie[serie.length - 1]!.confidence,
    readingsUsed: serie.length,
    velocityRecentBxH: pendiente(serie, new Date(now.getTime() - p.brixStallWindowHours * HORA / 2), now),
    velocityCumulativeBxH: pendiente(serie, fermentationStartedAt, now),
  };

  // Guarda de división por cero, antes de cualquier porcentaje.
  if (!(initial > BRIX_PHYSICAL_MIN && initial <= BRIX_PHYSICAL_MAX)) {
    return {
      ...conDatos,
      status: "SENSOR_FAULT",
      severity: "WARNING",
      alertKey: "alert.brix.sensor_fault",
      totalDropPct: null,
      warnings: avisos,
    };
  }

  const caida = (initial - current) / initial;
  const conCaida = { ...conDatos, totalDropPct: Math.round(caida * 10_000) / 10_000 };

  // --- Estancamiento ------------------------------------------------------
  // Inhibido durante un reposo frío declarado: la meseta es el objetivo.
  if (horas > p.stallSuspendedUntilHours) {
    const objetivo = now.getTime() - p.brixStallWindowHours * HORA;
    const candidata = serie
      .map((r) => ({ r, distancia: Math.abs(horasEntre(new Date(objetivo), r.measuredAt)) }))
      .filter((c) => c.distancia <= STALL_MATCH_TOLERANCE_H)
      .sort((a, b) => a.distancia - b.distancia)[0];

    if (!candidata) {
      // **NO corta la evaluación.** Ver la cabecera, punto 5.
      avisos.push("STALL_NOT_EVALUABLE");
    } else if (Math.abs(current - candidata.r.brix) < p.brixNoiseFloor) {
      const ok = confirmada(serie, () => true) && quietasAlFinal(serie, p.brixNoiseFloor);
      return {
        ...conCaida,
        status: "STAGNATION_HAZARD",
        severity: ok ? "CRITICAL" : "WARNING",
        alertKey: "alert.brix.stagnation",
        awaitingConfirmation: !ok,
        warnings: avisos,
      };
    }
  }

  // --- Ascensos: sólo los tardíos e inexplicados apuntan al dato ----------
  const penultima = serie[serie.length - 2]!;
  const ultima = serie[serie.length - 1]!;
  const subida = ultima.brix - penultima.brix;
  const horasDeLaSubida = horasEntre(fermentationStartedAt, ultima.measuredAt);
  if (subida > 1.0 && horasDeLaSubida > p.brixRiseGraceHours) {
    return {
      ...conCaida,
      status: "DATA_INTEGRITY_VIOLATION",
      severity: "WARNING",
      alertKey: "alert.brix.data_integrity_violation",
      warnings: avisos,
    };
  }

  // --- Terminación --------------------------------------------------------
  if (caida >= p.brixTargetDropPct || current <= p.brixFloor) {
    const ok = confirmada(
      serie,
      (r) => r.brix <= p.brixFloor || (initial - r.brix) / initial >= p.brixTargetDropPct,
    );
    return {
      ...conCaida,
      status: "TERMINATION_READY",
      severity: ok ? "CRITICAL" : "WARNING",
      alertKey: "alert.brix.termination_ready",
      awaitingConfirmation: !ok,
      warnings: avisos,
    };
  }

  return { ...conCaida, status: "FERMENTING", severity: "INFO", alertKey: null, warnings: avisos };
}

/**
 * Las dos últimas lecturas no se movieron entre sí.
 *
 * Es la mitad que hace honesta la confirmación del estancamiento: que la lectura
 * de hace doce horas coincida con la de ahora podría ser casualidad de dos
 * puntos; que **además** las dos últimas estén pegadas dice que sigue parada.
 */
function quietasAlFinal(serie: readonly BrixReading[], ruido: number): boolean {
  const dos = serie.slice(-2);
  return dos.length === 2 && Math.abs(dos[1]!.brix - dos[0]!.brix) < ruido;
}
