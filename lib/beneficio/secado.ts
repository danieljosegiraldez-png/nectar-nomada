/**
 * ¿Se está secando bien este lote, o se está sellando por fuera?
 *
 * **El motor `DryingMonitor` de `docs/beneficio/13`.** La v2.x **no tenía
 * especificación de secado en absoluto**, pese a que su propio `CLAUDE.md` lo
 * exigía y listaba la humedad entre las métricas de campo. Éste es el vacío
 * estructural C1 de la revisión.
 *
 * ## El secado no es lineal, y evaluarlo con un solo umbral de tasa lo arruina
 *
 * - **Fase de tasa constante** (aprox. > 25 % de humedad): el agua libre migra
 *   sin resistencia. Bajar diez puntos en un día es **normal** y alertar ahí
 *   produce un aviso falso en cada lote.
 * - **Fase de tasa decreciente** (< 25 %): el agua ligada tiene que salir desde
 *   dentro del grano. Forzar el secado aquí produce **endurecimiento
 *   superficial**: la superficie sella, el núcleo queda húmedo, **el medidor lee
 *   un valor bajo y falso**, y el lote desarrolla moho en bodega semanas
 *   después.
 *
 * Por eso la fase se determina **antes** de evaluar la tasa. Es el mismo descenso
 * de diez puntos en los dos casos; lo que cambia es si el café se está secando o
 * arruinando.
 *
 * ## Dos cosas que parecen anomalías y no lo son
 *
 * **El pergamino en patio rehidrata de noche.** La lectura de la mañana suele
 * ser mayor que la de la tarde anterior. Evaluar punto a punto genera una falsa
 * violación de integridad **cada amanecer**, así que la tasa se calcula sobre
 * medias móviles de 24 h — y las dos ventanas **no se solapan**, porque si se
 * solapan la subida nocturna entra en las dos y el resultado deja de discriminar.
 *
 * **Y la media es de las últimas 24 h, no del día de calendario**, que agruparía
 * distinto según a qué hora se tomó la primera lectura del lote.
 *
 * ## La única defensa contra un medidor engañado
 *
 * `consistenciaHumedadMasa` cruza el descenso de humedad con la pérdida de masa.
 * La materia seca **no cambia durante el secado** —es una constante por
 * definición—, así que de la humedad actual se deduce cuánto debería pesar el
 * lote. Si pesa bastante más, el grano está sellado y el medidor miente.
 *
 * Sin esta comprobación el sistema confía en un instrumento al que un grano
 * endurecido engaña, y el defecto aparece en bodega, cuando ya no tiene arreglo.
 */

import type { DataConfidence, Severity } from "./ph";

const DIA = 86_400_000;

export type DryingStatus =
  | "DATA_INSUFFICIENT"
  | "DRYING_NORMAL"
  | "RATE_TOO_FAST"
  | "STALLED_MOLD_HAZARD"
  | "UNEVEN_DRYING"
  | "TARGET_REACHED"
  | "OVER_DRIED"
  | "BEAN_TEMP_EXCEEDED";

export type DryingPhase = "CONSTANT_RATE" | "FALLING_RATE";

/**
 * Los umbrales del secado. **Todos `[PROVISIONAL]`** y todos aquí, porque la
 * v2.x los habría tenido que escribir como literales — no tenía objeto de
 * parámetros, lo que violaba la regla que su propio `CLAUDE.md` imponía.
 */
export interface DryingProfile {
  readonly targetMoistureLow: number;
  /**
   * **11,5 y no 12.** Cerca del 12 % el pergamino se sitúa en aw 0,62–0,68 y
   * nunca podría cumplir a la vez el criterio de actividad de agua: la mitad
   * superior de una banda 10–12 quedaría escrita de forma engañosa.
   */
  readonly targetMoistureHigh: number;
  readonly overDriedBelow: number;
  /** El parámetro que de verdad gobierna la estabilidad microbiana. */
  readonly maxWaterActivity: number;
  /** Por debajo de esto empieza la fase donde el secado forzado sella el grano. */
  readonly fallingRateThresholdPct: number;
  readonly maxDailyRatePp: number;
  /** Por encima de esta humedad, no bajar durante 24 h es riesgo de moho. */
  readonly stallAboveMoisturePct: number;
  readonly stallWindowHours: number;
  /** Dispersión = **rango**, no desviación típica: con tres puntos ésta es ambigua. */
  readonly maxDispersionPp: number;
  readonly maxBeanTempC: number;
  readonly massConsistencyTolerancePct: number;
}

export const PERFIL_DE_SECADO: DryingProfile = {
  targetMoistureLow: 10.0,
  targetMoistureHigh: 11.5,
  overDriedBelow: 9.5,
  maxWaterActivity: 0.6,
  fallingRateThresholdPct: 25,
  maxDailyRatePp: 2.0,
  stallAboveMoisturePct: 20,
  stallWindowHours: 24,
  maxDispersionPp: 1.5,
  maxBeanTempC: 40,
  massConsistencyTolerancePct: 3,
};

export interface DryingReading {
  readonly measuredAt: Date;
  /**
   * **Mínimo tres puntos por cama** —dos extremos y centro, a profundidad
   * media—. Se persisten los tres y se evalúa la media; el rango entre ellos es
   * lo que delata una cama que seca desigual.
   */
  readonly bedPointsPct: readonly number[];
  readonly waterActivity?: number | null;
  readonly beanTempC?: number | null;
  readonly confidence: DataConfidence;
}

export interface DryingAssessment {
  readonly status: DryingStatus;
  readonly severity: Severity;
  readonly alertKey: string | null;
  readonly currentMoisturePct: number | null;
  readonly waterActivity: number | null;
  readonly dailyRatePp: number | null;
  readonly phase: DryingPhase | null;
  readonly dispersionPp: number | null;
  /** Desde `dryingStartedAt`, **nunca** desde el inicio de la fermentación. */
  readonly daysElapsed: number;
  readonly massConsistencyDeltaPct: number | null;
  readonly confidence: DataConfidence;
  readonly readingsUsed: number;
  readonly warnings: readonly string[];
}

const redondear = (x: number, n = 2): number => Math.round(x * 10 ** n) / 10 ** n;
const media = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const humedadDe = (r: DryingReading): number => media(r.bedPointsPct);

/**
 * La media móvil de una ventana **semiabierta por la izquierda**: `(desde, hasta]`.
 *
 * Es lo que hace que las dos ventanas de 24 h no se solapen. Con ventanas
 * cerradas, la lectura del borde entra en las dos y la subida nocturna se cuenta
 * dos veces — justo el caso que la regla existe para no confundir.
 */
function mediaEnVentana(
  serie: readonly DryingReading[],
  desde: Date,
  hasta: Date,
): number | null {
  const v = serie.filter(
    (r) => r.measuredAt.getTime() > desde.getTime() && r.measuredAt.getTime() <= hasta.getTime(),
  );
  return v.length === 0 ? null : media(v.map(humedadDe));
}

export function evaluarSecado(input: {
  readings: readonly DryingReading[];
  dryingStartedAt: Date;
  now: Date;
  profile?: DryingProfile;
}): DryingAssessment {
  const p = input.profile ?? PERFIL_DE_SECADO;
  const { now, dryingStartedAt } = input;
  const dias = (now.getTime() - dryingStartedAt.getTime()) / DIA;

  const usables = input.readings.filter((r) => r.confidence !== "UNCALIBRATED");
  const vacio = {
    currentMoisturePct: null,
    waterActivity: null,
    dailyRatePp: null,
    phase: null,
    dispersionPp: null,
    daysElapsed: dias,
    massConsistencyDeltaPct: null,
    confidence: "UNCALIBRATED" as DataConfidence,
    readingsUsed: 0,
    warnings: [] as readonly string[],
  };
  if (usables.length === 0) {
    return { ...vacio, status: "DATA_INSUFFICIENT", severity: "INFO", alertKey: null };
  }

  const serie = [...usables].sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  const ultima = serie[serie.length - 1]!;
  const humedad = redondear(humedadDe(ultima), 3);
  const aw = ultima.waterActivity ?? null;

  const puntos = ultima.bedPointsPct;
  const dispersion = puntos.length > 1 ? redondear(Math.max(...puntos) - Math.min(...puntos)) : null;

  // **La fase se determina ANTES de evaluar la tasa.** Ver la cabecera.
  const fase: DryingPhase = humedad > p.fallingRateThresholdPct ? "CONSTANT_RATE" : "FALLING_RATE";

  const reciente = mediaEnVentana(serie, new Date(now.getTime() - p.stallWindowHours * 3_600_000), now);
  const anterior = mediaEnVentana(
    serie,
    new Date(now.getTime() - 2 * p.stallWindowHours * 3_600_000),
    new Date(now.getTime() - p.stallWindowHours * 3_600_000),
  );
  const tasa = reciente !== null && anterior !== null ? redondear(reciente - anterior) : null;

  const base = {
    currentMoisturePct: humedad,
    waterActivity: aw,
    dailyRatePp: tasa,
    phase: fase,
    dispersionPp: dispersion,
    daysElapsed: dias,
    massConsistencyDeltaPct: null,
    confidence: ultima.confidence,
    readingsUsed: serie.length,
  };

  const con = (s: DryingStatus, sev: Severity, k: string | null, w: readonly string[] = []) =>
    ({ ...base, status: s, severity: sev, alertKey: k, warnings: w }) satisfies DryingAssessment;

  if (ultima.beanTempC != null && ultima.beanTempC > p.maxBeanTempC) {
    return con("BEAN_TEMP_EXCEEDED", "CRITICAL", "alert.drying.bean_temp");
  }

  // Una cama que seca desigual invalida la media antes que cualquier veredicto
  // sobre ella: el promedio de 14,2 y 17,9 no describe ningún grano real.
  if (dispersion !== null && dispersion > p.maxDispersionPp) {
    return con("UNEVEN_DRYING", "WARNING", "alert.drying.uneven");
  }

  if (humedad < p.overDriedBelow) {
    return con("OVER_DRIED", "WARNING", "alert.drying.over_dried");
  }

  // **Las dos condiciones, no una.** La humedad porcentual sola no garantiza
  // estabilidad microbiana; la actividad de agua es la que la gobierna, y un
  // 11 % con aw 0,68 se enmohece igual.
  if (humedad >= p.targetMoistureLow && humedad <= p.targetMoistureHigh) {
    if (aw != null && aw <= p.maxWaterActivity) {
      return con("TARGET_REACHED", "INFO", "alert.drying.target_reached");
    }
  }

  // Estancamiento por encima del 20 %: ahí el moho es cuestión de horas, no de
  // días. Se mira contra la media de las 24 h anteriores, no punto a punto.
  if (humedad > p.stallAboveMoisturePct && tasa !== null && tasa >= 0) {
    return con("STALLED_MOLD_HAZARD", "CRITICAL", "alert.drying.stalled");
  }

  // El límite de tasa SÓLO en fase decreciente. Aplicarlo en la constante genera
  // alertas falsas continuas; no aplicarlo en la decreciente deja pasar el
  // defecto más caro del proceso.
  if (fase === "FALLING_RATE" && tasa !== null && tasa < -p.maxDailyRatePp) {
    return con("RATE_TOO_FAST", "WARNING", "alert.drying.rate_too_fast");
  }

  return con("DRYING_NORMAL", "INFO", null);
}

/**
 * ¿Cuadra el descenso de humedad con la pérdida de masa?
 *
 * **La materia seca es constante por definición** durante el secado, así que de
 * la humedad actual se deduce cuánto debería pesar el lote. Si pesa bastante
 * más, o el grano está sellado —y el medidor miente— o se perdió producto.
 *
 * La cantidad calculada es la **masa húmeda esperada**, no la materia seca.
 * Nombrarla mal invita a comparar una masa húmeda contra una variable de materia
 * seca, que es un error de una línea y de resultado plausible.
 */
export function consistenciaHumedadMasa(input: {
  initialMassKg: number;
  initialMoisturePct: number;
  currentMassKg: number;
  currentMoisturePct: number;
  profile?: DryingProfile;
}): { deltaPct: number; warnings: readonly string[] } {
  const p = input.profile ?? PERFIL_DE_SECADO;
  if (!(input.initialMassKg > 0)) throw new Error("initial_mass_kg debe ser positivo");
  if (input.currentMoisturePct >= 100) throw new Error("humedad actual fuera de rango");

  const materiaSeca = input.initialMassKg * (1 - input.initialMoisturePct / 100);
  const masaEsperada = materiaSeca / (1 - input.currentMoisturePct / 100);
  const delta = redondear(((input.currentMassKg - masaEsperada) / masaEsperada) * 100);

  return {
    deltaPct: delta,
    warnings: Math.abs(delta) > p.massConsistencyTolerancePct ? ["MOISTURE_MASS_INCONSISTENT"] : [],
  };
}
