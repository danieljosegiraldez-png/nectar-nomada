/**
 * Los umbrales del beneficio **no son globales**: dependen del protocolo.
 *
 * **Es el cambio estructural de la v3.0** y la razón está medida en su propia
 * revisión: un juego único de constantes genera falsos positivos masivos en los
 * protocolos no convencionales de Néctar Nómada. `COLD_HOLD_PREFERMENT` —que es
 * CryoBloom— tiene una meseta de pH **deliberada** durante el reposo frío; con
 * umbrales globales dispara `STALLED_ROT_HAZARD` de forma continua y **entrena
 * al operador a ignorar las alertas críticas**. La propia especificación llama a
 * esa fatiga «el modo de falla más probable de este sistema».
 *
 * **Todos los valores son `[PROVISIONAL]`** — práctica general de industria, sin
 * validar contra los equipos ni los microclimas de Daniel. Viven aquí como
 * configuración, nunca como literales en la lógica, que es lo que permite
 * cambiarlos cuando él decida sin tocar un motor. Ver `docs/beneficio/README.md`
 * y la decisión **P-F**.
 *
 * Fuente: `docs/beneficio/00_conventions.md` §8 y `03_public_api.md` §10.
 */

/** Las cinco claves del contrato. Un perfil descrito sólo en prosa no es implementable. */
export const CLAVES_DE_PERFIL = [
  "WASHED_STANDARD",
  "NATURAL",
  "ANAEROBIC_SHORT",
  "CARBONIC_MACERATION",
  "COLD_HOLD_PREFERMENT",
] as const;

export type ClaveDePerfil = (typeof CLAVES_DE_PERFIL)[number];

export interface ProtocolProfile {
  readonly key: ClaveDePerfil;
  /**
   * Los dos umbrales del reposo, en días desde que el secado terminó **con
   * objetivo alcanzado** (`DryingRun.endedOutcome === "target_reached"`).
   *
   * Opcional: un perfil sin reposo declarado no avisa de nada, que es distinto
   * de avisar que el café está listo. El motor lo dice con `PERFIL_SIN_REPOSO`.
   *
   * **`[PROVISIONAL]`** — los números salen de lo que Daniel dio de memoria el
   * 2026-09-16 y `P-F` sigue abierta. No están medidos, y el comentario se
   * queda para que una búsqueda los encuentre el día que se fijen.
   *
   * **Son por PROCESO, no por varietal**, y el spec §A.1 pide las dos cosas.
   * Hacer el varietal obliga a ensanchar la entrada de todo el motor, que es su
   * propio trabajo; mientras tanto el reposo declara `UMBRAL_SIN_VARIETAL` para
   * que el operario sepa que el número es del lavado, no de su Geisha.
   */
  readonly reposo?: {
    /** Habilita sacar muestra: tostar, analizar, cerrar una venta. */
    readonly diasParaMuestra: number;
    /** Habilita vender. SIEMPRE mayor que `diasParaMuestra`. */
    readonly diasParaVenta: number;
  };
  // --- pH ---
  /** Borde inferior **inclusivo** de la ventana óptima. */
  readonly phOptimalLow: number;
  /** Borde superior **exclusivo**. En v2.5 este valor satisfacía «óptimo» y «estancado» a la vez. */
  readonly phOptimalHigh: number;
  readonly phCriticalLow: number;
  /** Por debajo de aquí el daño ya ocurrió: dispara sin esperar confirmación. */
  readonly phImmediateLow: number;
  /** Horas antes de que un pH alto cuente como estancamiento, y ventana de la meseta. */
  readonly phStallGraceHours: number;
  /** Mientras `hoursElapsed` no lo supere, la meseta es el objetivo del protocolo. */
  readonly stallSuspendedUntilHours: number;
  // --- Brix: declarados aquí porque el perfil es uno solo; los usa `brix.ts`. ---
  readonly brixTargetDropPct: number;
  readonly brixFloor: number;
  readonly brixStallWindowHours: number;
  readonly brixNoiseFloor: number;
  readonly brixRiseGraceHours: number;
}

/**
 * La tabla de `00_conventions.md` §8, entera.
 *
 * **`Record` total y no un mapa parcial**: el compilador obliga a declarar cada
 * perfil nuevo con todos sus campos. Es la misma lección que dejó el
 * `?? ["proceso_de_cafe"]` de septiembre — un tipo que no compila es mejor
 * guardia que un test que hay que acordarse de mirar.
 */
export const PERFILES: Readonly<Record<ClaveDePerfil, ProtocolProfile>> = {
  WASHED_STANDARD: {
    key: "WASHED_STANDARD",
    // [PROVISIONAL] Daniel, 2026-09-16: «lavado 60–90 días». Se toma el borde
    // bajo del rango, que es donde empieza a poder venderse, no donde es óptimo.
    reposo: { diasParaMuestra: 30, diasParaVenta: 60 },
    phOptimalLow: 3.8,
    phOptimalHigh: 4.5,
    phCriticalLow: 3.5,
    phImmediateLow: 3.3,
    phStallGraceHours: 12,
    stallSuspendedUntilHours: 0,
    brixTargetDropPct: 0.35,
    brixFloor: 15,
    brixStallWindowHours: 12,
    brixNoiseFloor: 0.3,
    brixRiseGraceHours: 6,
  },
  NATURAL: {
    key: "NATURAL",
    // [PROVISIONAL] Daniel, 2026-09-16: «natural Catuaí óptimo entre 45 y 60».
    reposo: { diasParaMuestra: 30, diasParaVenta: 45 },
    phOptimalLow: 3.9,
    phOptimalHigh: 4.8,
    phCriticalLow: 3.6,
    phImmediateLow: 3.4,
    phStallGraceHours: 24,
    stallSuspendedUntilHours: 0,
    brixTargetDropPct: 0.25,
    brixFloor: 16,
    brixStallWindowHours: 24,
    brixNoiseFloor: 0.5,
    brixRiseGraceHours: 12,
  },
  ANAEROBIC_SHORT: {
    key: "ANAEROBIC_SHORT",
    phOptimalLow: 3.6,
    phOptimalHigh: 4.4,
    phCriticalLow: 3.4,
    phImmediateLow: 3.2,
    phStallGraceHours: 6,
    stallSuspendedUntilHours: 0,
    brixTargetDropPct: 0.25,
    brixFloor: 15,
    brixStallWindowHours: 6,
    brixNoiseFloor: 0.3,
    brixRiseGraceHours: 3,
  },
  CARBONIC_MACERATION: {
    key: "CARBONIC_MACERATION",
    phOptimalLow: 3.7,
    phOptimalHigh: 4.6,
    phCriticalLow: 3.45,
    phImmediateLow: 3.25,
    phStallGraceHours: 24,
    stallSuspendedUntilHours: 0,
    brixTargetDropPct: 0.3,
    brixFloor: 15,
    brixStallWindowHours: 24,
    brixNoiseFloor: 0.3,
    brixRiseGraceHours: 12,
  },
  /**
   * **CryoBloom.** `stallSuspendedUntilHours = 48` inhibe las alertas de
   * estancamiento durante toda la fase fría, que se reporta como
   * `STALL_SUSPENDED_COLD_HOLD`. Ajustar a la duración real del reposo.
   */
  COLD_HOLD_PREFERMENT: {
    key: "COLD_HOLD_PREFERMENT",
    phOptimalLow: 3.8,
    phOptimalHigh: 4.5,
    phCriticalLow: 3.5,
    phImmediateLow: 3.3,
    phStallGraceHours: 12,
    stallSuspendedUntilHours: 48,
    brixTargetDropPct: 0.35,
    brixFloor: 15,
    brixStallWindowHours: 12,
    brixNoiseFloor: 0.3,
    brixRiseGraceHours: 24,
  },
};

/**
 * **Constantes físicas, que NO son umbrales de dominio.**
 *
 * Delimitan lo que un instrumento puede medir, no lo que el café debe hacer, así
 * que no dependen del protocolo y quedan exentas de la regla de «ningún umbral
 * literal». Fuente: `docs/beneficio/03_public_api.md` §10.
 */
export const PH_PHYSICAL_MIN = 2.5;
export const PH_PHYSICAL_MAX = 8.0;
export const PH_INITIAL_PHASE_FLOOR = 5.2;
/** pH/h. Por debajo de esto la curva se considera plana. */
export const PLATEAU_EPSILON = 0.01;
/** Sólo para reportar la pendiente reciente; no decide ningún estado. */
export const RECENT_WINDOW_H = 6.0;
/** Ventana de confirmación del motor de pH — §9: dos lecturas separadas así. */
export const PH_CONFIRM_MIN_H = 0.25;
export const PH_CONFIRM_MAX_H = 4.0;

export const BRIX_PHYSICAL_MIN = 0.0;
export const BRIX_PHYSICAL_MAX = 32.0;
/**
 * La del Brix es **otra ventana**, y no por capricho: su cadencia de muestreo es
 * más lenta que la del pH. Una ventana única volvía imposible confirmar nada en
 * los motores lentos.
 */
export const BRIX_CONFIRM_MIN_H = 1.0;
export const BRIX_CONFIRM_MAX_H = 8.0;
/** Cuántas lecturas entran en la mediana robusta. Por CONTEO, no por ventana. */
export const MEDIAN_WINDOW = 3;
/** Por debajo de esto los conjuntos de mediana se solapan e `initial` == `current`. */
export const MIN_READINGS_FOR_MEDIAN = 4;
/** Cuánto puede alejarse una lectura del borde de la ventana y seguir sirviendo. */
export const STALL_MATCH_TOLERANCE_H = 1.5;
