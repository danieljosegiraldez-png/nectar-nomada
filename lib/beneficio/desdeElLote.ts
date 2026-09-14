/**
 * El puente entre lo que este repositorio guarda y lo que los motores esperan.
 *
 * Los cuatro motores de `lib/beneficio/` son dominio puro: reciben lecturas y
 * devuelven un veredicto. Este archivo es lo único que sabe **de dónde salen
 * esas lecturas aquí**, y su trabajo de verdad no es traducir — es **declarar lo
 * que no se puede traducir** en vez de rellenarlo con un valor por defecto.
 *
 * ## Las tres cosas que nuestro modelo no tiene, y qué se hace con cada una
 *
 * | lo que el contrato pide | aquí | qué se hace |
 * |---|---|---|
 * | `ProtocolProfile` del lote | **no existe** | se deduce del grado de proceso donde es defendible, y si no, **no hay veredicto** |
 * | `confidence` de la lectura | no existe | se deriva de `provenanceClass` y de si fue corregida |
 * | `sample_point` | **no existe** | el guardia de puntos mezclados de Brix **no puede funcionar aquí**, y se dice |
 *
 * **Ninguna de las tres se inventa.** Un valor por defecto en cualquiera de
 * ellas volvería infalsificable el veredicto —la lección del `??
 * ["proceso_de_cafe"]` de septiembre— y aquí el coste sería peor: un lote sin
 * perfil parecería estar en protocolo lavado y se juzgaría con umbrales que no
 * son los suyos.
 *
 * ## Y todo esto sigue siendo asesor
 *
 * Los umbrales son `[PROVISIONAL]` mientras **P-F** siga abierta. Lo que sale de
 * aquí **pregunta**, no ordena: la decisión de lavar un lote es de quien está
 * frente al tanque, que ve el olor, el color y la espuma que ningún motor mide.
 */

import { evaluarBrix, type BrixAssessment, type BrixReading } from "./brix";
import { evaluarPh, type DataConfidence, type PHAssessment, type PHReading } from "./ph";
import { PERFILES, type ClaveDePerfil, type ProtocolProfile } from "./perfiles";
import { evaluarSecado, type DryingAssessment, type DryingReading } from "./secado";

/**
 * Del grado de proceso al perfil del contrato — **sólo donde es defendible**.
 *
 * El catálogo `grado_proceso` es de Daniel y tiene cinco valores: `Natural`,
 * `Washed`, `Semi Wash 50%`, `Semi Wash 75%` y `Honey`. Los perfiles del
 * paquete son otros cinco y **no son los mismos cinco**:
 *
 * - **Dos casan**: `Washed` → `WASHED_STANDARD`, `Natural` → `NATURAL`.
 * - **Tres grados se quedan sin perfil**: los dos semi-lavados y el honey. Sus
 *   umbrales no están escritos en ninguna parte, y suponerles los del lavado
 *   sería inventar una cinética.
 * - **Tres perfiles se quedan sin grado**: `ANAEROBIC_SHORT`,
 *   `CARBONIC_MACERATION` y —el que más importa— **`COLD_HOLD_PREFERMENT`, que
 *   es CryoBloom**. Hoy no hay forma de decir que un lote corre ese protocolo,
 *   así que su reposo frío deliberado se leería como un estancamiento.
 *
 * Cerrar ese hueco **es un cambio de esquema** y se propone aparte, que es lo
 * que Daniel pidió el 2026-09-13: «no cambies el esquema de datos ni la API sin
 * proponérmelo aparte».
 */
const PERFIL_POR_GRADO: Readonly<Record<string, ClaveDePerfil>> = {
  Washed: "WASHED_STANDARD",
  Natural: "NATURAL",
};

/** Lo mínimo que este módulo necesita de una medición nuestra. */
export interface MedicionDelLote {
  readonly variable: string;
  readonly value: number;
  readonly occurredAt: Date;
  readonly provenanceClass: string;
  /** Si algo la corrige, esta lectura quedó superseded y no alimenta alertas. */
  readonly fueCorregida: boolean;
}

/**
 * Qué tan de fiar es una lectura **con lo que este repositorio sí guarda**.
 *
 * El contrato pide cinco niveles de confianza que nacen de la calibración del
 * instrumento. Aquí no hay calibración por lectura, así que se deriva de dos
 * cosas que sí existen y significan algo parecido:
 *
 * - **una lectura corregida está superseded**: la original sigue guardada —nunca
 *   se borra— pero la que manda es la corrección, y por eso queda fuera;
 * - **sólo un `measured_fact` puede confirmar una alerta crítica.** Una
 *   interpretación o una sugerencia de IA no bastan para mandar a lavar un lote,
 *   que es lo que la histéresis de §9 existe para impedir.
 *
 * `UNCALIBRATED` es el valor que los motores **excluyen del cálculo**, así que
 * se usa para lo superseded: es exactamente ese comportamiento.
 */
export function confianzaDe(m: MedicionDelLote): DataConfidence {
  if (m.fueCorregida) return "UNCALIBRATED";
  return m.provenanceClass === "measured_fact" ? "VALIDATED" : "TEMP_UNCOMPENSATED";
}

/** Por qué un lote no tiene veredicto. **«No se sabe» no es «va bien».** */
export type SinVeredicto =
  | "SIN_PROCESO_ABIERTO"
  | "GRADO_SIN_PERFIL"
  | "SIN_GRADO_DECLARADO"
  | "SIN_LECTURAS";

export interface VeredictoDeFase {
  readonly fase: "fermentacion" | "secado";
  readonly perfil: ProtocolProfile;
  readonly ph: PHAssessment | null;
  readonly brix: BrixAssessment | null;
  readonly secado: DryingAssessment | null;
  /**
   * Lo que este puente no pudo traducir. Va hasta la pantalla a propósito: un
   * veredicto cuyo origen no se puede auditar no vale más que una corazonada.
   */
  readonly limitaciones: readonly string[];
}

export interface EntradaDelLote {
  /** `null` si el lote no tiene fase abierta. */
  readonly fase: { tipo: "fermentacion" | "secado"; iniciadaEn: Date } | null;
  /** El `value` del catálogo `grado_proceso`, tal cual. `null` si no hay proceso. */
  readonly gradoDeProceso: string | null;
  readonly mediciones: readonly MedicionDelLote[];
  readonly ahora: Date;
}

/**
 * El veredicto de la fase activa de un lote, o la razón por la que no lo hay.
 *
 * **Devuelve la razón y no `null` a secas** porque la pantalla tiene que poder
 * decirla: «este lote no tiene receta que diga su protocolo» y «este lote va
 * bien» son hechos distintos, y pintarlos igual es lo que convierte una
 * herramienta en un adorno.
 */
export function veredictoDelLote(entrada: EntradaDelLote): VeredictoDeFase | SinVeredicto {
  if (!entrada.fase) return "SIN_PROCESO_ABIERTO";
  if (!entrada.gradoDeProceso) return "SIN_GRADO_DECLARADO";

  const clave = PERFIL_POR_GRADO[entrada.gradoDeProceso];
  if (!clave) return "GRADO_SIN_PERFIL";
  const perfil = PERFILES[clave];

  const usables = entrada.mediciones.filter((m) => !m.fueCorregida);
  if (usables.length === 0) return "SIN_LECTURAS";

  const limitaciones: string[] = [];
  const comun = (m: MedicionDelLote) => ({
    measuredAt: m.occurredAt,
    confidence: confianzaDe(m),
  });

  if (entrada.fase.tipo === "fermentacion") {
    const dePh = entrada.mediciones.filter((m) => m.variable === "ph");
    const deBrix = entrada.mediciones.filter((m) => m.variable === "brix");

    const ph: PHReading[] = dePh.map((m) => ({ ...comun(m), ph: m.value }));
    // **El punto de muestreo no existe en nuestro modelo**, así que se declara
    // uno solo para toda la serie. Consecuencia que hay que decir en voz alta:
    // el guardia de `MIXED_SAMPLE_POINTS` **no puede disparar aquí**. Si alguien
    // mide licor de tanque y mucílago exprimido el mismo día, el motor los
    // comparará como si fueran la misma serie y nadie lo sabrá.
    const brix: BrixReading[] = deBrix.map((m) => ({
      ...comun(m),
      brix: m.value,
      samplePoint: "TANK_LIQUID_MID" as const,
    }));
    if (deBrix.length > 0) limitaciones.push("SIN_PUNTO_DE_MUESTREO");

    return {
      fase: "fermentacion",
      perfil,
      ph: ph.length > 0
        ? evaluarPh({ readings: ph, fermentationStartedAt: entrada.fase.iniciadaEn, now: entrada.ahora, profile: perfil })
        : null,
      brix: brix.length > 0
        ? evaluarBrix({ readings: brix, fermentationStartedAt: entrada.fase.iniciadaEn, now: entrada.ahora, profile: perfil })
        : null,
      secado: null,
      limitaciones,
    };
  }

  const deHumedad = entrada.mediciones.filter((m) => m.variable === "moisture");
  if (deHumedad.length === 0) return "SIN_LECTURAS";
  // Una lectura de humedad nuestra es **un número, no tres puntos de cama**. El
  // contrato pide un mínimo de tres —dos extremos y el centro— porque el rango
  // entre ellos es lo que delata una cama que seca desigual. Con un solo punto
  // `UNEVEN_DRYING` no puede salir nunca, y eso también se dice.
  limitaciones.push("UN_SOLO_PUNTO_DE_CAMA");
  const lecturas: DryingReading[] = deHumedad.map((m) => ({
    measuredAt: m.occurredAt,
    bedPointsPct: [m.value],
    waterActivity: null,
    beanTempC: null,
    confidence: confianzaDe(m),
  }));
  // Sin actividad de agua `TARGET_REACHED` tampoco puede salir: exige las dos.
  limitaciones.push("SIN_ACTIVIDAD_DE_AGUA");

  return {
    fase: "secado",
    perfil,
    ph: null,
    brix: null,
    secado: evaluarSecado({ readings: lecturas, dryingStartedAt: entrada.fase.iniciadaEn, now: entrada.ahora }),
    limitaciones,
  };
}
