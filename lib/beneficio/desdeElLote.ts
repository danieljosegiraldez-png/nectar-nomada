/**
 * El puente entre lo que este repositorio guarda y lo que los motores esperan.
 *
 * Los cuatro motores de `lib/beneficio/` son dominio puro: reciben lecturas y
 * devuelven un veredicto. Este archivo es lo único que sabe **de dónde salen
 * esas lecturas aquí**, y su trabajo de verdad no es traducir — es **declarar lo
 * que no se puede traducir** en vez de rellenarlo con un valor por defecto.
 *
 * ## Lo que el puente puede traducir, y lo que debe declarar
 *
 * | lo que el contrato pide | aquí | qué se hace |
 * |---|---|---|
 * | `ProtocolProfile` del lote | **no existe** | se deduce del grado de proceso donde es defendible, y si no, **no hay veredicto** |
 * | `confidence` de la lectura | no existe | se deriva de `provenanceClass` y de si fue corregida |
 * | `sample_point` | `materialState` cuando está declarado | se traduce al punto compatible; si falta, se declara la limitación |
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

import { evaluarBrix, type BrixAssessment, type BrixReading, type SamplePoint } from "./brix";
import { evaluarPh, type DataConfidence, type PHAssessment, type PHReading } from "./ph";
import {
  confianzaPorVerificacion,
  peorConfianza,
  type EstadoDeVerificacion,
} from "../equipos/verificacion";
import { PERFILES, type ClaveDePerfil, type ProtocolProfile } from "./perfiles";
import { evaluarReposo, type EstadoDeReposo } from "./reposo";
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

/**
 * El perfil que rige un lote **por la fase que tiene abierta**, o `null` si no se puede decir — para quien
 * necesita saber a qué protocolo pertenece un umbral antes de citárselo (la cita de «qué sugiere el dato si
 * se espera», que es de la matriz `WASHED_STANDARD`).
 *
 * Sigue el MISMO orden que `veredictoDelLote` y devuelve `null` donde éste devuelve una razón
 * (`SIN_PROCESO_ABIERTO`, `SIN_GRADO_DECLARADO`, `GRADO_SIN_PERFIL`): **sin fase abierta no hay perfil que
 * aplicar, sin proceso o sin grado tampoco, y un grado que no casa no se completa con el del lavado.** `null`
 * es «no se sabe», nunca «el de siempre».
 *
 * **Y sólo si la fase abierta es de FERMENTACIÓN.** La matriz que se cita es de un protocolo **y de una
 * fase**: `10_ph_fermentation.md` §1 es la matriz de pH de la fermentación, y `13_drying_moisture.md` no tiene
 * ninguna. Un lote `Washed` con una corrida de SECADO abierta tiene perfil `WASHED_STANDARD` pero su pH, si lo
 * hubiera, cae dentro de una ventana de secado: citarle la cinética de la fermentación sería afirmar algo que
 * no se sostiene. Con secado —o con cualquier fase que no sea fermentación— devuelve `null`; no se inventa una
 * matriz de secado.
 *
 * **Y sólo si el proceso de esa corrida TIENE RECETA** (`processRecipeVersion`). Que el grado sea `Washed` no
 * demuestra que la receta use los umbrales de la matriz: `00_conventions.md` §8 (ADR-181) dice que los perfiles
 * son **plantillas** para crear recetas, que los umbrales salen de la receta y que **sin receta el motor no
 * opina**. Sin receta, `curvaDeUnLote` ni siquiera tiene banda que pintar —la pantalla dice «esta variable no
 * tiene rango declarado en la receta»— y citar a la vez «Degradación ácida» sería contradecirse en la misma
 * pantalla. La ausencia de receta cierra la puerta igual que la cierran la fase y el grado. **Qué dice la
 * receta —leer sus `ProcessTarget` y compararlos con la matriz— NO se hace aquí:** basta con que exista.
 *
 * **Y sólo si ese proceso sigue ABIERTO** (revisión final de la Parte 1, ronda de arreglo 1, 2026-10-03; menor M10). Desde R7
 * el proceso que llega es el VIGENTE del resolvedor, abierto o cerrado, y el veredicto de la misma fila sólo toma un proceso
 * abierto (`entradaDelLote`): con uno cerrado, la fila decía «sin grado declarado» y la curva citaba a la vez la matriz del
 * lavado. Una corrida vieja (R9) abierta bajo un proceso ya cerrado no tiene grado que la rija.
 *
 * `abierta` es la corrida abierta del lote (fermentación o secado) tal como la trae `datosDelTablero`, con el
 * `proceso` que CUBRE al lote (Parte 1, R7: del resolvedor, no de la FK de la corrida); `undefined` = el lote no
 * tiene ninguna. Sin fase abierta no hay perfil. La clave no se llama `lotProcess` para que no se lea como una
 * relación de Prisma: el guardia `proceso-por-el-resolvedor` la marcaría, y con razón de forma.
 *
 * `Object.hasOwn` y no `PERFIL_POR_GRADO[grado]` a secas: el grado viene de un catálogo de texto libre y un
 * valor como `constructor` encontraría la función heredada del objeto en vez de ningún perfil.
 */
export function perfilDeLaFaseAbierta(
  abierta:
    | {
        readonly fase: "fermentation" | "drying";
        readonly proceso: {
          readonly processGradeValue: { readonly value: string } | null;
          /** La versión de receta del proceso, o `null` si no tiene. Sólo importa que exista. */
          readonly processRecipeVersion: object | null;
          /** `null` = abierto. Obligatorio a propósito: un valor por defecto «abierto» haría infalsificable la guarda. */
          readonly endedAt: Date | null;
        } | null;
      }
    | undefined,
): ClaveDePerfil | null {
  if (!abierta) return null;
  // La matriz de pH es de la fermentación: con cualquier otra fase no hay umbral citable (ver arriba).
  if (abierta.fase !== "fermentation") return null;
  // Sin receta el motor no opina (ADR-181): el grado sólo sugiere una plantilla, no demuestra que la receta la use.
  if (!abierta.proceso?.processRecipeVersion) return null;
  // Un proceso CERRADO no rige la fase abierta: el veredicto de la misma fila ya no lo toma (ver arriba, M10).
  if (abierta.proceso.endedAt !== null) return null;
  const grado = abierta.proceso.processGradeValue?.value;
  if (!grado || !Object.hasOwn(PERFIL_POR_GRADO, grado)) return null;
  return PERFIL_POR_GRADO[grado] ?? null;
}

/** Lo mínimo que este módulo necesita de una medición nuestra. */
export interface MedicionDelLote {
  readonly materialState?: "CHERRY" | "MUCILAGE_HONEY" | "PARCHMENT" | "GREEN" | null;
  readonly samplingRole?: "ZONE" | "REPLICATE" | null;
  readonly samplingEventId?: string | null;
  readonly waterActivity?: number | null;
  readonly variable: string;
  readonly value: number;
  readonly occurredAt: Date;
  readonly provenanceClass: string;
  /** Si algo la corrige, esta lectura quedó superseded y no alimenta alertas. */
  readonly fueCorregida: boolean;
  /**
   * Cómo estaba el instrumento **en el instante de esta lectura**.
   *
   * Opcional y con `SIN_INSTRUMENTO` por defecto, que es el estado real de
   * todas las lecturas de hoy: `measurement.instrument_id` acaba de existir y
   * nadie lo ha rellenado. Un defecto distinto —tratar el hueco como avería—
   * excluiría del cálculo cada lectura del repositorio y apagaría esta pantalla
   * entera el día que se despliegue.
   */
  readonly estadoDelInstrumento?: EstadoDeVerificacion;
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
  const porProcedencia: DataConfidence = m.fueCorregida
    ? "UNCALIBRATED"
    : m.provenanceClass === "measured_fact"
      ? "VALIDATED"
      : "TEMP_UNCOMPENSATED";

  // **Y la del instrumento, que es la mitad añadida el 2026-09-14.** Una lectura
  // impecable tomada con un refractómetro que falló su contraste sigue sin poder
  // confirmar nada; una lectura corregida tomada con un instrumento impecable
  // sigue siendo una lectura corregida. Por eso manda la PEOR y no un promedio:
  // cada motivo por separado basta para dudar.
  //
  // `SIN_INSTRUMENTO` devuelve `null` y no impone nada — no saber con qué se
  // midió no es saber que el instrumento estaba mal.
  const porInstrumento = confianzaPorVerificacion(m.estadoDelInstrumento ?? "SIN_INSTRUMENTO");
  return porInstrumento === null ? porProcedencia : peorConfianza(porProcedencia, porInstrumento);
}

/** Por qué un lote no tiene veredicto. **«No se sabe» no es «va bien».** */
export type SinVeredicto =
  | "SIN_PROCESO_ABIERTO"
  | "GRADO_SIN_PERFIL"
  | "SIN_GRADO_DECLARADO"
  | "SIN_LECTURAS";

export interface VeredictoDeFase {
  readonly fase: "fermentacion" | "secado" | "reposo";
  readonly perfil: ProtocolProfile;
  readonly ph: PHAssessment | null;
  readonly brix: BrixAssessment | null;
  readonly secado: DryingAssessment | null;
  /**
   * Sólo en la fase `reposo`; nulo en las otras dos. Lleva los días y las dos
   * compuertas —muestra y venta—, ninguna de las cuales bloquea nada.
   */
  readonly reposo: EstadoDeReposo | null;
  /**
   * Lo que este puente no pudo traducir. Va hasta la pantalla a propósito: un
   * veredicto cuyo origen no se puede auditar no vale más que una corazonada.
   */
  readonly limitaciones: readonly string[];
}

export interface EntradaDelLote {
  /** `null` si el lote no tiene fase abierta. */
  readonly fase: { tipo: "fermentacion" | "secado" | "reposo"; iniciadaEn: Date } | null;
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

  if (entrada.fase.tipo === "reposo") {
    // **El reposo no necesita lecturas.** Es una edad, no una medición, así que
    // no cae por `SIN_LECTURAS` como las otras dos fases: un lote reposando en
    // bodega no produce mediciones y sigue teniendo días.
    const reposo = evaluarReposo({
      finDeSecado: entrada.fase.iniciadaEn,
      desenlace: "target_reached",
      perfil: perfil.reposo,
      ahora: entrada.ahora,
    });

    // El umbral es del PROCESO, no del varietal, y eso se declara en vez de
    // disimularlo: el operario tiene que ver que el número que le enseñan es
    // del lavado y no de su Geisha. El spec §A.1 pide las dos cosas y esto
    // hace una; callarlo sería peor que no tenerlo.
    const limitacionesDeReposo = [...reposo.limitaciones, "UMBRAL_SIN_VARIETAL"];

    return {
      fase: "reposo",
      perfil,
      ph: null,
      brix: null,
      secado: null,
      reposo: { ...reposo, limitaciones: reposo.limitaciones },
      limitaciones: limitacionesDeReposo,
    };
  }

  const usables = entrada.mediciones.filter((m) => !m.fueCorregida);
  if (usables.length === 0) return "SIN_LECTURAS";

  const limitaciones: string[] = [];
  if (usables.some((m) => !m.materialState)) limitaciones.push("SIN_PUNTO_DE_MUESTREO");
  // **Se declara cuando NINGUNA lectura usable dice con qué se midió.** Hoy es
  // siempre, y por eso importa decirlo en vez de callarlo: un veredicto cuyo
  // origen no se puede auditar no vale más que una corazonada, y el operario
  // merece saber que nadie ha comprobado el aparato que dio estos números.
  if (usables.every((m) => (m.estadoDelInstrumento ?? "SIN_INSTRUMENTO") === "SIN_INSTRUMENTO")) {
    limitaciones.push("SIN_INSTRUMENTO_DECLARADO");
  }
  const comun = (m: MedicionDelLote) => ({
    measuredAt: m.occurredAt,
    confidence: confianzaDe(m),
  });

  if (entrada.fase.tipo === "fermentacion") {
    const dePh = entrada.mediciones.filter((m) => m.variable === "ph");
    const deBrix = entrada.mediciones.filter((m) => m.variable === "brix");

    const ph: PHReading[] = dePh.map((m) => ({ ...comun(m), ph: m.value }));
    // GREEN no tiene equivalente en el contrato de Brix: no se inventa uno.
    const puntos: Partial<Record<NonNullable<MedicionDelLote["materialState"]>, SamplePoint>> = {
      CHERRY: "CHERRY_PULP",
      MUCILAGE_HONEY: "MUCILAGE_PRESSED",
      PARCHMENT: "PARCHMENT_BED",
    };
    const brix: BrixReading[] = deBrix.flatMap((m) => {
      if (m.materialState === "GREEN") return [];
      return [{
        ...comun(m),
        brix: m.value,
        // Compatibilidad con lecturas antiguas; el hueco se declara abajo.
        samplePoint: m.materialState ? puntos[m.materialState]! : "TANK_LIQUID_MID",
      }];
    });
    if (deBrix.some((m) => m.materialState === "GREEN")) {
      limitaciones.push("SIN_PUNTO_DE_MUESTREO");
    }

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
      reposo: null,
      limitaciones,
    };
  }

  const deHumedad = entrada.mediciones.filter((m) => m.variable === "moisture");
  if (deHumedad.length === 0) return "SIN_LECTURAS";
  const zonasPorEvento = new Map<string, MedicionDelLote[]>();
  for (const m of deHumedad) {
    if (m.samplingEventId && m.samplingRole === "ZONE" && confianzaDe(m) !== "UNCALIBRATED") {
      const zonas = zonasPorEvento.get(m.samplingEventId) ?? [];
      zonas.push(m);
      zonasPorEvento.set(m.samplingEventId, zonas);
    }
  }
  const actividades = usables.filter((m) => m.variable === "water_activity" && confianzaDe(m) !== "UNCALIBRATED");
  const emitidos = new Set<string>();
  const lecturas: DryingReading[] = deHumedad.flatMap((m) => {
    const zonas = m.samplingEventId ? zonasPorEvento.get(m.samplingEventId) : undefined;
    const agrupada = zonas?.includes(m) ?? false;
    if (agrupada && emitidos.has(m.samplingEventId!)) return [];
    if (agrupada) emitidos.add(m.samplingEventId!);
    const puntos = agrupada ? zonas! : [m];
    const aw = m.samplingEventId
      ? actividades.filter((a) => a.samplingEventId === m.samplingEventId)
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0]
      : undefined;
    const confianza = puntos.reduce((c, p) => peorConfianza(c, confianzaDe(p)), confianzaDe(m));
    return [{
      measuredAt: new Date(Math.max(...puntos.map((p) => p.occurredAt.getTime()))),
      bedPointsPct: puntos.map((p) => p.value),
      waterActivity: aw?.value ?? null,
      beanTempC: null,
      confidence: aw ? peorConfianza(confianza, confianzaDe(aw)) : confianza,
    }];
  });
  if (![...zonasPorEvento.values()].some((zonas) => zonas.length >= 2)) {
    limitaciones.push("UN_SOLO_PUNTO_DE_CAMA");
  }
  if (!lecturas.some((m) => m.waterActivity != null)) {
    limitaciones.push("SIN_ACTIVIDAD_DE_AGUA");
  }

  return {
    fase: "secado",
    perfil,
    ph: null,
    brix: null,
    secado: evaluarSecado({ readings: lecturas, dryingStartedAt: entrada.fase.iniciadaEn, now: entrada.ahora }),
    reposo: null,
    limitaciones,
  };
}
