import { prisma } from "../db";
import { Prisma } from "../../generated/prisma/client";
import {
  recordFieldEvent,
  FieldSessionValidationError,
  LocationAccessError,
  type Coordinates,
} from "../traceability/fieldSessions";
import { recordInspection, InspectionValidationError } from "../apiary/inspections";
import { recordColonyEvent, ColonyEventValidationError } from "../apiary/colonyEvents";
import { ApiaryAccessError, ColonyEndError, registrarFinDeColonia } from "../apiary/hives";
import { ClaseDeCausaInvalida, exigeClaseDeCausa } from "../apiary/causaDePerdida";
import { exigeMetodoDeVarroa, registrarConteoDeVarroa, VarroaValidationError } from "../apiary/varroa";
import { EstadoDeColoniaInvalido } from "../apiary/estadoDeColonia";
import { AlimentacionInvalida } from "../apiary/alimentacion";
import { TratamientoInvalido } from "../apiary/objetivoDelTratamiento";
import { ArtefactoInvalido } from "../apiary/artefactos";
import { createSoilSample, createFoliarSample, SampleValidationError } from "../traceability/soilSamples";
import { createSoilProfile, SoilProfileValidationError } from "../traceability/soilProfiles";
import { createPlantingCohort, PlantingCohortValidationError } from "../traceability/plantingCohorts";
import { recordTrapCheck, requireTrapAccess, TrapValidationError, TrapAccessError } from "../traceability/traps";
import type { HorizonteDelFormulario } from "../traceability/horizontesDelFormulario";
import {
  exigeProcedencia,
  ProcedenciaInvalida,
  PROCEDENCIA_DE_REGISTRO_DE_CAMPO,
  PROCEDENCIA_DE_SIEMBRA,
} from "../traceability/procedencia";
import {
  CanopyPosition,
  DataQuality,
  HarvestWindowPrecision,
  SoilFeatureObservation,
  TrapCaptureLevel,
} from "../../generated/prisma/enums";

/**
 * P4 §4 (46_P4_API_Y_SINCRONIZACION.md) — push por lotes con resultado **por
 * mutación**.
 *
 * La forma entera del protocolo está en el ticket; lo que este módulo decide,
 * y que no es obvio leyendo el ticket, es **dónde está la frontera entre un
 * rechazo y un fallo**:
 *
 * - Un `FieldSessionValidationError` o un `LocationAccessError` son el
 *   servidor **corriendo y negándose**. Se convierten en `rejected` con su
 *   razón, la mutación siguiente se intenta igual, y el cliente marca ese
 *   borrador como error para que el operador lo vea. Reintentarlo no lo
 *   arreglaría nunca.
 * - Cualquier otro error **se propaga y tumba la petición entera**. Es la base
 *   caída, un fallo de red a mitad, un defecto nuestro: el cliente no puede
 *   distinguirlo de «no llegué», y no debe — deja todo en cola y reintenta.
 *
 * Esa distinción no es una elección de estilo: es la que `offlineQueue.syncAll`
 * ya implementa desde A5/A0 («if the sync call itself throws, the request never
 * reached the server… if it resolves with ok:false, the server did run and
 * rejected it»). Tragarse un error inesperado como `rejected` haría que un
 * corte de base borrara trabajo de campo presentándolo como dato inválido.
 */

/**
 * A9.5 — el lote acepta también lo que se captura en el apiario.
 *
 * **Por qué aquí y no en una tercera cola.** `lib/sync/offlineQueue.ts` ya lo
 * dejó escrito con su disparador: *«el momento es cuando apiario pase a push
 * por lotes; entonces las dos colapsan en ésta y `lib/apiary/` pasa a ser un
 * envoltorio»*. Esto es la mitad del servidor de ese colapso; el cliente sigue
 * usando su cola de una en una y no se toca, para que la única superficie de
 * captura que hoy funciona en producción no dependa de este cambio.
 *
 * **No se reimplementa ninguna regla.** Una mutación de apiario llama a
 * `recordInspection` / `recordColonyEvent`, que ya traen lo suyo: la compuerta
 * correcta —`apiary:manage` para inspección, la más estrecha para evento—, la
 * idempotencia por `clientDraftId`, el `AuditEvent` en la misma transacción, y
 * desde A9.2 el enganche a la visita abierta. Copiar esas reglas aquí sería
 * crear un segundo sitio donde envejecen por separado.
 */
export type PushMutation =
  | MutacionDeEvento
  | MutacionDeInspeccion
  | MutacionDeEventoDeColonia
  | MutacionDeFinDeColonia
  | MutacionDeConteoDeVarroa
  | MutacionDeMuestraDeSuelo
  | MutacionDeMuestraFoliar
  | MutacionDePerfilDeSuelo
  | MutacionDeSiembra
  | MutacionDeRevisionDeTrampa;

export type MutacionDeEvento = {
  /** Ausente es `field_event`: el protocolo viejo sigue valiendo tal cual. */
  kind?: "field_event";
  clientDraftId: string;
  fieldSessionId: string;
  eventKindValueId: string;
  occurredAt: Date;
  recordedAt?: Date | null;
  position?: Coordinates;
  operatorPersonId?: string | null;
  notes?: string | null;
  measurementId?: string | null;
  quantityEventId?: string | null;
  specimenObservationId?: string | null;
  assetId?: string | null;
  harvestEventId?: string | null;
  lotTransformationId?: string | null;
};

/**
 * Los campos son los que `RecordInspectionInput` ya define. No se valida aquí
 * lo que el servicio valida: se traduce y se delega.
 */
export type MutacionDeInspeccion = {
  kind: "inspection";
  clientDraftId: string;
  colonyId: string;
  occurredAt: Date;
  outcome: string;
  operatorPersonId?: string | null;
  broodPatternNote?: string | null;
  queenSighted?: boolean | null;
  storesLevel?: string | null;
  temperamentNote?: string | null;
  pestDiseaseFlags?: string | null;
  /**
   * Las banderas del catálogo, por id. Viajan en la mutación porque una
   * inspección con hallazgo se anota en el campo, sin señal: dejarlas fuera
   * habría hecho que sólo se pudieran marcar con cobertura, que es exactamente
   * el hueco que esta cola existe para cerrar.
   */
  irregularidades?: readonly string[];
  /** Artefactos de colmena, Tarea 2: lo que cambió en la caja. Viaja por la cola. */
  cambiosDeConfiguracion?: readonly { kind: string; accion: string; count?: number | null; notes?: string | null }[] | null;
  note?: string | null;

  // --- Anexo B §2.2, estado de la colonia. Viajan como CADENAS porque así salen
  // del formulario y del cuerpo JSON, y los valida `./estadoDeColonia` dentro del
  // servicio — no se cuelan en el enum con `as never`.
  population?: string | null;
  beeCoveredFrames?: number | string | null;
  /** Spec 2026-09-18 §5.3. Una mutación encolada ANTES de este campo no lo trae: llega nulo, «no se contó». */
  darkFrames?: number | string | null;
  broodStages?: readonly string[] | null;
  queenCellKind?: string | null;
  queenCellCount?: number | string | null;
  honeyStoresLevel?: string | null;
  honeyNextToBrood?: boolean | null;
  pollenStoresLevel?: string | null;
  pollenNextToBrood?: boolean | null;
  droneBroodPresent?: boolean | null;
};

export type MutacionDeEventoDeColonia = {
  kind: "colony_event";
  clientDraftId: string;
  colonyId: string;
  occurredAt: Date;
  eventType: string;
  operatorPersonId?: string | null;
  note?: string | null;
  /** Del vocabulario del dueno (ADR-148). Viaja por la cola: sin esto el desplegable
   *  funcionaria en linea y se perderia justo en campo, que es donde se usa. */
  feedingMaterialKind?: string | null;
  feedingMaterial?: string | null;
  feedingQuantity?: number | null;
  feedingUnit?: string | null;
  treatmentProduct?: string | null;
  /** Número, como en `RecordColonyEventInput`: una dosis se compara. */
  treatmentDose?: number | null;
  treatmentDoseUnit?: string | null;
  treatmentBatchLabel?: string | null;
  /** Días de carencia. Obligatorio en el servicio cuando el tipo es tratamiento. */
  treatmentWithdrawalDays?: number | null;
  /** Botiquín, Tarea 7: el frasco del que salió la dosis. Opcional; viaja por la cola. */
  consumableLotId?: string | null;
  /**
   * A9 · Anexo B §3 — «alcanza hasta». **Fecha ya parseada**, no cadena: el
   * parseo la convierte con `fechaDeDia` porque es un campo de DÍA. Pasarla como
   * texto haría que Prisma la interpretara por su cuenta, que es el fallo que
   * tumbó la creación de colmenas el 2026-09-11.
   */
  coverageUntil?: Date | null;
  /** Cómo se dejó el alimento. Cadena; la valida el servicio. */
  feedingMethod?: string | null;
  /**
   * A9 · Anexo B §4 — contra qué se trató. **Obligatorio en el servicio cuando el
   * tipo es tratamiento**, así que una mutación sin él vuelve como `rejected` con
   * su razón, no como un lote tumbado.
   */
  treatmentTarget?: string | null;
  /** Cómo se aplicó. Opcional. */
  treatmentRoute?: string | null;
};

/**
 * El fin de una colonia, anotado sin señal.
 *
 * **Es la única mutación de apiario que no inserta: actualiza.** De ahí que su
 * idempotencia viva en `Colony.endClientDraftId` y no en una fila nueva, y de
 * ahí que el `duplicate` haya que distinguirlo a mano — ver
 * `aplicarFinDeColonia`.
 *
 * `causas` viaja como la declara el formulario. No se valida aquí lo que el
 * servicio valida: se traduce y se delega, igual que las otras dos.
 */
export type MutacionDeFinDeColonia = {
  kind: "colony_end";
  clientDraftId: string;
  colonyId: string;
  /** Cuándo se perdió, no cuándo se sincroniza. */
  endedAt: Date;
  status: string;
  reason?: string | null;
  causas?: readonly { causeValueId: string; provenanceClass: string; dataQuality?: string | null; note?: string | null }[];
};

/**
 * A9.6 — el conteo de varroa, anotado sin señal.
 *
 * `method` viaja como texto y lo valida el servicio, igual que `outcome` y
 * `eventType` en sus hermanas. `evaluatesColonyEventId` es opcional porque
 * contar para **decidir** si se trata es el caso normal; cuando viene, el
 * servicio comprueba que sea un tratamiento de esta misma colonia.
 */
export type MutacionDeConteoDeVarroa = {
  kind: "varroa_count";
  clientDraftId: string;
  colonyId: string;
  occurredAt: Date;
  method: string;
  sampleBees: number;
  mitesCounted: number;
  evaluatesColonyEventId?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
};

/**
 * Cola offline para captura de parcela. Los cuatro tipos que
 * `lib/sync/parsearMutaciones.ts` reconoce; aplicarlos contra la base es la
 * tarea siguiente, no ésta.
 */
export type MutacionDeMuestraDeSuelo = {
  kind: "soil_sample";
  clientDraftId: string;
  locationId: string;
  sampleCode: string;
  sampledAt: Date;
  provenanceClass: string;
  dataQuality?: string | null;
  treatmentPlotLabel?: string | null;
  samplingPointLabel?: string | null;
  depthTopCm?: number | null;
  depthBottomCm?: number | null;
  subSampleCount?: number | null;
  laboratory?: string | null;
  extractionMethod?: string | null;
  notes?: string | null;
};

export type MutacionDeMuestraFoliar = {
  kind: "foliar_sample";
  clientDraftId: string;
  locationId: string;
  sampleCode: string;
  sampledAt: Date;
  provenanceClass: string;
  dataQuality?: string | null;
  treatmentPlotLabel?: string | null;
  leafPairPosition?: number | null;
  canopyPosition?: string | null;
  treeAgeYears?: number | null;
  cultivar?: string | null;
  phenologicalStage?: string | null;
  branchBearingFruit?: boolean | null;
  laboratory?: string | null;
  notes?: string | null;
};

export type MutacionDePerfilDeSuelo = {
  kind: "soil_profile";
  clientDraftId: string;
  locationId: string;
  describedAt: Date;
  provenanceClass: string;
  dataQuality?: string | null;
  pitDepthCm?: number | null;
  rootingDepthCm?: number | null;
  rootDistribution?: string | null;
  /**
   * §6.1 — las cuatro observaciones de anaerobiosis. Viajan como CADENAS y las
   * valida `aplicarCapturaDeParcela` contra `SoilFeatureObservation` antes de
   * llamar al servicio, por la misma razón que `method` en el conteo de varroa:
   * un valor malo tiene que volver como `rejected` con su razón, no como un 500
   * que deja la cola dando vueltas.
   */
  mottling?: string | null;
  greyColours?: string | null;
  rootChannelConcretions?: string | null;
  sourSmell?: string | null;
  impedingLayerDepthCm?: number | null;
  impedingLayerNote?: string | null;
  notes?: string | null;
  /**
   * Los horizontes descritos. **Es la única mutación con un array anidado**, y
   * no es un adorno: el operador cava el hoyo una vez, y una calicata sin sus
   * horizontes describe un suelo que nadie vio. Misma forma que
   * `SoilHorizonInput`, que es lo que `createSoilProfile` espera.
   */
  horizons?: readonly HorizonteDelFormulario[];
};

export type MutacionDeSiembra = {
  kind: "planting_cohort";
  clientDraftId: string;
  locationId: string;
  provenanceClass: string;
  dataQuality?: string | null;
  cultivarValueId?: string | null;
  plantedAt?: Date | null;
  plantedPrecision?: string | null;
  plantCount?: number | null;
  notes?: string | null;
};

/**
 * La revisión de la ronda de trampas, sin señal — Tarea 11.
 *
 * **Sin `observerPersonId` ni `provenanceClass`, a diferencia de las cuatro
 * mutaciones de arriba.** Ruling del controlador: la ronda aplica la MISMA
 * regla que `recordRoundTrapCheckFormAction` (Tarea 10) — procedencia y
 * observador se fijan en el SERVIDOR, nunca desde lo que trae la mutación. Un
 * payload de cola es tan falsificable como un `<input type="hidden">`
 * (SECURITY.md §2), así que aunque esta mutación trajera esos dos campos,
 * `aplicarRevisionDeTrampa` los ignora.
 */
export type MutacionDeRevisionDeTrampa = {
  kind: "trap_check";
  clientDraftId: string;
  locationId: string;
  specimenId: string;
  observedAt: Date;
  brocaLevel: string;
  captureCount?: number | null;
  otherInsects?: boolean | null;
  otherInsectsNote?: string | null;
  cleaned?: boolean | null;
  liquidChanged?: boolean | null;
  lureRecharged?: boolean | null;
};

export type PushResult =
  | { clientDraftId: string; status: "applied"; id: string }
  | { clientDraftId: string; status: "duplicate"; id: string }
  | { clientDraftId: string; status: "rejected"; reason: string };

/** El lote entero se niega: el aparato no existe o está revocado. */
export class DeviceError extends Error {}

/**
 * Aplica una mutación de apiario delegando en su servicio de dominio.
 *
 * El servicio devuelve la fila sin decir si la acaba de crear, así que la
 * comprobación previa por `clientDraftId` es lo que separa `applied` de
 * `duplicate`. Es la misma forma que el camino de `FieldEvent` usa, y por la
 * misma razón.
 */
async function aplicarMutacionDeApiario(
  userAccountId: string,
  m: MutacionDeInspeccion | MutacionDeEventoDeColonia,
): Promise<PushResult> {
  const yaEstaba =
    m.kind === "inspection"
      ? await prisma.inspection.findUnique({ where: { clientDraftId: m.clientDraftId }, select: { id: true } })
      : await prisma.colonyEvent.findUnique({ where: { clientDraftId: m.clientDraftId }, select: { id: true } });
  if (yaEstaba) return { clientDraftId: m.clientDraftId, status: "duplicate", id: yaEstaba.id };

  try {
    const fila =
      m.kind === "inspection"
        ? await recordInspection(userAccountId, {
            colonyId: m.colonyId,
            occurredAt: m.occurredAt,
            operatorPersonId: m.operatorPersonId ?? null,
            outcome: m.outcome as never,
            broodPatternNote: m.broodPatternNote ?? null,
            queenSighted: m.queenSighted ?? null,
            storesLevel: m.storesLevel ?? null,
            temperamentNote: m.temperamentNote ?? null,
            pestDiseaseFlags: m.pestDiseaseFlags ?? null,
            irregularidades: m.irregularidades ?? [],
            cambiosDeConfiguracion: m.cambiosDeConfiguracion ?? null,
            note: m.note ?? null,
            // Anexo B §2.2 — se pasan tal cual llegan; el servicio los valida.
            population: m.population ?? null,
            beeCoveredFrames: m.beeCoveredFrames ?? null,
            darkFrames: m.darkFrames ?? null,
            broodStages: m.broodStages ?? null,
            queenCellKind: m.queenCellKind ?? null,
            queenCellCount: m.queenCellCount ?? null,
            honeyStoresLevel: m.honeyStoresLevel ?? null,
            honeyNextToBrood: m.honeyNextToBrood ?? null,
            pollenStoresLevel: m.pollenStoresLevel ?? null,
            pollenNextToBrood: m.pollenNextToBrood ?? null,
            droneBroodPresent: m.droneBroodPresent ?? null,
            clientDraftId: m.clientDraftId,
          })
        : await recordColonyEvent(userAccountId, {
            colonyId: m.colonyId,
            occurredAt: m.occurredAt,
            operatorPersonId: m.operatorPersonId ?? null,
            eventType: m.eventType as never,
            note: m.note ?? null,
            feedingMaterialKind: m.feedingMaterialKind ?? null,
            feedingMaterial: m.feedingMaterial ?? null,
            feedingQuantity: m.feedingQuantity ?? null,
            feedingUnit: m.feedingUnit ?? null,
            treatmentProduct: m.treatmentProduct ?? null,
            treatmentDose: m.treatmentDose ?? null,
            treatmentDoseUnit: m.treatmentDoseUnit ?? null,
            treatmentBatchLabel: m.treatmentBatchLabel ?? null,
            treatmentWithdrawalDays: m.treatmentWithdrawalDays ?? null,
            consumableLotId: m.consumableLotId ?? null,
            coverageUntil: m.coverageUntil ?? null,
            feedingMethod: m.feedingMethod ?? null,
            treatmentTarget: m.treatmentTarget ?? null,
            treatmentRoute: m.treatmentRoute ?? null,
            clientDraftId: m.clientDraftId,
          });
    return { clientDraftId: m.clientDraftId, status: "applied", id: fila.id };
  } catch (error) {
    // Un fallo de PERMISO o de VALIDACIÓN es un rechazo del servidor: se
    // informa y el borrador se descarta. Cualquier otra cosa se relanza, para
    // que un corte de base no borre trabajo de campo disfrazado de dato malo.
    if (
      error instanceof ApiaryAccessError ||
      error instanceof ColonyEventValidationError ||
      error instanceof InspectionValidationError ||
      // Anexo B §2.2: «población = telepatía» es un rechazo del servidor, no un
      // fallo de transporte. Sin esta línea, un valor malo tumbaría el lote
      // entero y dejaría la cola bloqueada — el defecto de ADR-116, otra vez.
      error instanceof EstadoDeColoniaInvalido ||
      error instanceof AlimentacionInvalida ||
      error instanceof TratamientoInvalido ||
      // Artefactos, Tarea 2: un cambio de caja inválido es un dato malo, no un corte; sin esta
      // línea el borrador se reintentaría para siempre.
      error instanceof ArtefactoInvalido
    ) {
      return { clientDraftId: m.clientDraftId, status: "rejected", reason: error.message };
    }
    throw error;
  }
}

/**
 * Aplica un fin de colonia. **El `duplicate` aquí se gana, no se hereda.**
 *
 * Las otras dos mutaciones preguntan por `clientDraftId` en la tabla que van a
 * insertar. Ésta actualiza, así que la pregunta es otra: ¿esta MISMA clave ya
 * terminó una colonia? Si sí, el borrador ya se aplicó y se descarta en
 * silencio. Si la colonia está terminada pero con otra clave —o sin ninguna,
 * porque se declaró desde la web—, **no es un duplicado**: es que alguien llegó
 * antes, y eso el operador tiene que verlo.
 *
 * Confundir las dos haría que se descartara un aviso real, o que saltara una
 * alarma por trabajo que sí se guardó.
 */
async function aplicarFinDeColonia(userAccountId: string, m: MutacionDeFinDeColonia): Promise<PushResult> {
  const mismoBorrador = await prisma.colony.findUnique({
    where: { endClientDraftId: m.clientDraftId },
    select: { id: true },
  });
  if (mismoBorrador) return { clientDraftId: m.clientDraftId, status: "duplicate", id: mismoBorrador.id };

  try {
    const fila = await registrarFinDeColonia(userAccountId, {
      colonyId: m.colonyId,
      status: m.status as never,
      endedAt: m.endedAt,
      reason: m.reason ?? null,
      causas: (m.causas ?? []).map((c) => ({
        causeValueId: c.causeValueId,
        provenanceClass: exigeClaseDeCausa(c.provenanceClass),
        dataQuality: (c.dataQuality ?? null) as never,
        note: c.note ?? null,
      })),
      clientDraftId: m.clientDraftId,
    });
    return { clientDraftId: m.clientDraftId, status: "applied", id: fila.id };
  } catch (error) {
    // Mismo corte que `aplicarMutacionDeApiario`: permiso y validación son
    // rechazos del servidor y se informan; cualquier otra cosa se relanza para
    // que un corte de base no borre trabajo de campo disfrazado de dato malo.
    if (error instanceof ApiaryAccessError || error instanceof ColonyEndError || error instanceof ClaseDeCausaInvalida) {
      return { clientDraftId: m.clientDraftId, status: "rejected", reason: error.message };
    }
    throw error;
  }
}

/**
 * Aplica un conteo de varroa. Misma forma que `aplicarMutacionDeApiario`: la
 * consulta previa por `clientDraftId` es lo que separa `applied` de `duplicate`,
 * y el servicio trae la compuerta, la validación, el audit y el enganche a la
 * visita abierta.
 *
 * `method` llega como cadena del cuerpo JSON y **se valida aquí**, con
 * `exigeMetodoDeVarroa`, en vez de colarse en el enum con `as never` como hacen
 * `outcome` y `eventType` más arriba. Su `VarroaValidationError` cae en el mismo
 * corte: rechazo del servidor, no fallo de transporte.
 */
async function aplicarConteoDeVarroa(userAccountId: string, m: MutacionDeConteoDeVarroa): Promise<PushResult> {
  const yaEstaba = await prisma.varroaCount.findUnique({
    where: { clientDraftId: m.clientDraftId },
    select: { id: true },
  });
  if (yaEstaba) return { clientDraftId: m.clientDraftId, status: "duplicate", id: yaEstaba.id };

  try {
    const fila = await registrarConteoDeVarroa(userAccountId, {
      colonyId: m.colonyId,
      occurredAt: m.occurredAt,
      method: exigeMetodoDeVarroa(m.method),
      sampleBees: m.sampleBees,
      mitesCounted: m.mitesCounted,
      evaluatesColonyEventId: m.evaluatesColonyEventId ?? null,
      operatorPersonId: m.operatorPersonId ?? null,
      notes: m.notes ?? null,
      clientDraftId: m.clientDraftId,
    });
    return { clientDraftId: m.clientDraftId, status: "applied", id: fila.id };
  } catch (error) {
    if (error instanceof ApiaryAccessError || error instanceof VarroaValidationError) {
      return { clientDraftId: m.clientDraftId, status: "rejected", reason: error.message };
    }
    throw error;
  }
}

/**
 * Busca por `clientDraftId` en la tabla que corresponde a `kind`.
 *
 * Un objeto `{kind: delegado}` no tipa: cada `findUnique` de Prisma tiene su
 * propio tipo de argumentos y la unión de las cuatro firmas no es invocable
 * (TS2349). Se pregunta con un `switch` por la misma razón que el resto del
 * archivo despacha por `kind` con ternarios, no con una tabla. Se usa dos
 * veces: la comprobación previa al `create`, y la recuperación cuando la
 * carrera de abajo hace perder a esta llamada.
 */
function buscarCapturaPorClientDraftId(
  kind: "soil_sample" | "foliar_sample" | "soil_profile" | "planting_cohort",
  clientDraftId: string,
) {
  return kind === "soil_sample"
    ? prisma.soilSample.findUnique({ where: { clientDraftId }, select: { id: true } })
    : kind === "foliar_sample"
      ? prisma.foliarSample.findUnique({ where: { clientDraftId }, select: { id: true } })
      : kind === "soil_profile"
        ? prisma.soilProfile.findUnique({ where: { clientDraftId }, select: { id: true } })
        : prisma.plantingCohort.findUnique({ where: { clientDraftId }, select: { id: true } });
}

/**
 * ¿Este `P2002` es el índice único de `client_draft_id` chocando, y no el
 * `@@unique([locationId, sampleCode])` que suelo y foliar también tienen?
 *
 * Medido contra la base real (2026-09-16): con el adaptador de driver que usa
 * este proyecto, Prisma NO pone el nombre de columna en `error.meta.target`
 * como documenta el caso clásico — lo anida en
 * `error.meta.driverAdapterError.cause.constraint.fields`. Se comprueban las
 * dos formas: la documentada, por si el adaptador cambia, y la medida, que es
 * la que de verdad ocurre aquí. Sin esta distinción, un choque real de
 * `(locationId, sampleCode)` — dos muestras distintas con el mismo código —
 * se leería como `duplicate` en vez de subir como el dato malo que es.
 */
function camposDelP2002(error: Prisma.PrismaClientKnownRequestError): string[] {
  const meta = error.meta as
    | { target?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } } }
    | undefined;
  const target = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
  return Array.isArray(target) ? target.map(String) : [];
}

function esCarreraDeClientDraftId(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const campos = camposDelP2002(error);
  return campos.length === 1 && campos[0] === "client_draft_id";
}

/**
 * Un `P2002` que NO es la carrera de arriba: **el dato es malo, y hay que
 * decirlo con su razón**.
 *
 * El caso real es `@@unique([locationId, sampleCode])`, que sigue vivo en las
 * dos tablas de muestra: dos muestras distintas del mismo bloque con el mismo
 * código. Sin esta rama subía como excepción → **500** →
 * `clasificarRespuesta(500)` = `reintentar` → `syncFieldEvents` no marca ni un
 * borrador, todos quedan pendientes, y el mismo lote vuelve **para siempre**
 * hasta que la purga de los 21 días lo borre. Y la pantalla decía «el servidor
 * no pudo atender», que es mentira: el servidor corrió y el dato no se puede
 * guardar. El spec lo pide explícito — un dato que no se puede validar vuelve
 * como rechazo **con su razón**.
 *
 * La razón nombra las columnas del índice, no un genérico, porque es lo único
 * que le dice a quien lo lea CUÁL de los datos está repetido.
 */
function razonDeUnicidad(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const campos = camposDelP2002(error);
  return campos.length ? `already_used:${campos.join(",")}` : "already_used";
}

/** Un valor de enum que llegó del cuerpo JSON y no existe en la base. */
export class ValorEnumeradoInvalido extends Error {}

/**
 * Devuelve el valor si existe en el enum de la base, o lanza.
 *
 * **Sustituye a un `as never`**, con el mismo argumento que `exigeProcedencia`
 * (`lib/traceability/procedencia.ts`): ese `as never` no convertía nada,
 * apagaba al compilador y dejaba llegar la cadena cruda a Prisma. Con señal eso
 * es un error de la acción que el operador ve; **sin señal es un 500**, o sea
 * la cola atascada en silencio, porque nadie llega a evaluar nada.
 *
 * Se comprueba contra el enum de la base y no contra la lista de cada
 * formulario: el camino CON señal tampoco estrecha estos tres (`dataQuality`,
 * `canopyPosition`, `plantedPrecision` y las banderas de suelo viajan con `as
 * never` en `app/actions/traceability.ts`), y rechazar aquí lo que allí se
 * acepta haría que el mismo dato se guardara o no según hubiera cobertura.
 * `provenanceClass` es la excepción y va por `exigeProcedencia`, porque ahí los
 * dos caminos SÍ estrechan igual.
 */
function exigeValorEnumerado<T extends string>(
  valor: string | null | undefined,
  permitidos: Readonly<Record<string, T>>,
  campo: string,
): T | null {
  if (valor == null || valor === "") return null;
  const encontrado = Object.values(permitidos).find((p) => p === valor);
  if (encontrado === undefined) throw new ValorEnumeradoInvalido(`${campo}_not_valid:${valor}`);
  return encontrado;
}

/**
 * Las cuatro creaciones de parcela. La comprobación previa por `clientDraftId`
 * es lo que separa `applied` de `duplicate`; sin ella un reintento crearía la
 * muestra dos veces.
 */
async function aplicarCapturaDeParcela(
  userAccountId: string,
  m: MutacionDeMuestraDeSuelo | MutacionDeMuestraFoliar | MutacionDePerfilDeSuelo | MutacionDeSiembra,
): Promise<PushResult> {
  const yaEstaba = await buscarCapturaPorClientDraftId(m.kind, m.clientDraftId);
  if (yaEstaba) return { clientDraftId: m.clientDraftId, status: "duplicate", id: yaEstaba.id };

  try {
    // Los enums se validan ANTES de llamar al servicio, no se cuelan con
    // `as never`: un valor que Postgres no conoce sería una excepción, y una
    // excepción aquí es un 500 que deja la cola dando vueltas. Ver
    // `exigeValorEnumerado` arriba.
    //
    // `provenanceClass` va por `exigeProcedencia`, la MISMA lista que pinta el
    // formulario, porque aquí los dos caminos sí estrechan igual — y la siembra
    // ofrece `interpretation` además de las dos de campo, como su pantalla.
    const comun = {
      locationId: m.locationId,
      provenanceClass: exigeProcedencia(
        m.provenanceClass,
        m.kind === "planting_cohort" ? PROCEDENCIA_DE_SIEMBRA : PROCEDENCIA_DE_REGISTRO_DE_CAMPO,
      ),
      dataQuality: exigeValorEnumerado(m.dataQuality, DataQuality, "dataQuality"),
      clientDraftId: m.clientDraftId,
    };
    const fila =
      m.kind === "soil_sample"
        ? await createSoilSample(userAccountId, { ...comun, sampleCode: m.sampleCode, sampledAt: m.sampledAt,
            treatmentPlotLabel: m.treatmentPlotLabel ?? null,
            depthTopCm: m.depthTopCm ?? null, depthBottomCm: m.depthBottomCm ?? null,
            subSampleCount: m.subSampleCount ?? null, samplingPointLabel: m.samplingPointLabel ?? null,
            extractionMethod: m.extractionMethod ?? null, laboratory: m.laboratory ?? null, notes: m.notes ?? null })
      : m.kind === "foliar_sample"
        ? await createFoliarSample(userAccountId, { ...comun, sampleCode: m.sampleCode, sampledAt: m.sampledAt,
            treatmentPlotLabel: m.treatmentPlotLabel ?? null,
            leafPairPosition: m.leafPairPosition ?? null,
            canopyPosition: exigeValorEnumerado(m.canopyPosition, CanopyPosition, "canopyPosition"),
            treeAgeYears: m.treeAgeYears ?? null, cultivar: m.cultivar ?? null,
            phenologicalStage: m.phenologicalStage ?? null, branchBearingFruit: m.branchBearingFruit ?? null,
            laboratory: m.laboratory ?? null, notes: m.notes ?? null })
      : m.kind === "soil_profile"
        ? await createSoilProfile(userAccountId, { ...comun, describedAt: m.describedAt,
            pitDepthCm: m.pitDepthCm ?? null, rootingDepthCm: m.rootingDepthCm ?? null,
            rootDistribution: m.rootDistribution ?? null,
            mottling: exigeValorEnumerado(m.mottling, SoilFeatureObservation, "mottling"),
            greyColours: exigeValorEnumerado(m.greyColours, SoilFeatureObservation, "greyColours"),
            rootChannelConcretions: exigeValorEnumerado(
              m.rootChannelConcretions, SoilFeatureObservation, "rootChannelConcretions"),
            sourSmell: exigeValorEnumerado(m.sourSmell, SoilFeatureObservation, "sourSmell"),
            impedingLayerDepthCm: m.impedingLayerDepthCm ?? null,
            impedingLayerNote: m.impedingLayerNote ?? null, notes: m.notes ?? null,
            horizons: [...(m.horizons ?? [])] })
      : await createPlantingCohort(userAccountId, { ...comun, cultivarValueId: m.cultivarValueId ?? null,
            plantedAt: m.plantedAt ?? null,
            plantedPrecision: exigeValorEnumerado(m.plantedPrecision, HarvestWindowPrecision, "plantedPrecision"),
            plantCount: m.plantCount ?? null, notes: m.notes ?? null });
    return { clientDraftId: m.clientDraftId, status: "applied", id: fila.id };
  } catch (error) {
    // Carrera: dos llamadas con el mismo `clientDraftId` —un reintento del
    // cliente disparado antes de que vuelva la primera respuesta— pueden pasar
    // las dos el `findUnique` de arriba antes de que la primera termine su
    // `create`. La perdedora choca aquí contra el índice único y Prisma lo
    // reporta como `P2002`, que sin este caso subiría como excepción no
    // controlada en vez de resolver a `duplicate` como promete el protocolo.
    // Se busca la fila del ganador y se devuelve igual que el camino feliz.
    if (esCarreraDeClientDraftId(error)) {
      const ganador = await buscarCapturaPorClientDraftId(m.kind, m.clientDraftId);
      if (ganador) return { clientDraftId: m.clientDraftId, status: "duplicate", id: ganador.id };
    }
    // Un dato malo es respuesta del servidor; un corte de base sube, para que no
    // borre trabajo de campo disfrazado de dato inválido.
    // Son CUATRO clases, una por servicio, y no se pueden resumir en una:
    // soilSamples.ts lanza SampleValidationError (suelo y foliar comparten),
    // soilProfiles.ts SoilProfileValidationError, plantingCohorts.ts
    // PlantingCohortValidationError, y los cuatro lanzan LocationAccessError
    // cuando la parcela no es del usuario. El precedente está en este mismo
    // archivo: la rama de field_event ya devuelve `rejected` ante uno de acceso.
    if (
      error instanceof SampleValidationError ||
      error instanceof SoilProfileValidationError ||
      error instanceof PlantingCohortValidationError ||
      error instanceof LocationAccessError ||
      // Los dos que estrena la cola offline: un enum que la base no conoce y una
      // procedencia que la pantalla no ofrece. Con señal los ve el operador en
      // el acto; aquí, sin esta línea, serían un 500 y la cola daría vueltas.
      error instanceof ValorEnumeradoInvalido ||
      error instanceof ProcedenciaInvalida
    ) {
      return { clientDraftId: m.clientDraftId, status: "rejected", reason: error.message };
    }
    // Un `P2002` que no era la carrera de arriba es el dato repetido: se dice
    // cuál, y se descarta. Va DESPUÉS de las clases de dominio y ANTES del
    // `throw`, que es donde estaba el agujero.
    const repetido = razonDeUnicidad(error);
    if (repetido) return { clientDraftId: m.clientDraftId, status: "rejected", reason: repetido };
    throw error;
  }
}

/**
 * Aplica una revisión de la ronda de trampas — Tarea 11.
 *
 * **Procedencia y observador NUNCA salen de `m`.** Ruling del controlador:
 * `provenanceClass` es siempre `direct_observation`, y el observador es la
 * Person de la cuenta del DISPOSITIVO que empujó el lote (`userAccountId`,
 * resuelto por `resolverPrincipal` a partir de la cookie o el token), no un
 * id que la mutación pudiera forjar. Sin persona vinculada a esa cuenta, se
 * rechaza explícito — nunca se guarda un observador `null` en su lugar
 * (ADR-080). Con el fix final A1+A2, éste es el ÚNICO sitio que fija esta
 * regla para la ronda: ya no existe un camino «con señal» paralelo que la
 * repitiera por su cuenta.
 *
 * La comprobación previa por `clientDraftId` es lo que separa `applied` de
 * `duplicate`, igual que en `aplicarCapturaDeParcela`.
 *
 * **A9 fix-final (M2), ruling del controlador — el lookup por
 * `clientDraftId` corre DESPUÉS del control de acceso, y sólo cuenta como
 * duplicado si la fila es de la MISMA trampa.** Antes corría el PRIMERO de
 * todos, sin comprobar acceso ni `specimenId`: cualquiera con un
 * `clientDraftId` ajeno (colisionado, o filtrado por otro medio) podía leer
 * «ya se aplicó, con éxito» para una revisión de una trampa que no puede
 * ver. `recordTrapCheck` repite la misma comprobación por su cuenta
 * (defensa en profundidad, igual que `listPlotBlocks`/`getPlotDetail`): la
 * de aquí evita llegar a llamarlo cuando el resultado ya se puede decidir
 * sin acceso.
 *
 * El orden final es: cuenta del dispositivo (no depende de nada de `m`,
 * posición sin cambios respecto de antes de este arreglo) → trampa +
 * control de acceso → `clientDraftId`. Mover la cuenta DESPUÉS del acceso
 * habría hecho que un `userAccountId` que no resuelve a ninguna fila —el
 * único caso real de «sin persona vinculada», porque el esquema exige
 * `personId` `NOT NULL`— se rechazara siempre por «sin acceso» en vez de
 * «sin observador»: el mismo `userAccountId` sin fila no tiene tampoco
 * ninguna asignación, así que `requireTrapAccess` habría llegado primero
 * SIEMPRE, y el motivo de rechazo original habría quedado inalcanzable.
 */
async function aplicarRevisionDeTrampa(
  userAccountId: string,
  m: MutacionDeRevisionDeTrampa,
): Promise<PushResult> {
  // Sin cambio de posición respecto de antes de A9: no depende de acceso a
  // NADA de `m` — es la cuenta del dispositivo que empujó el lote, ya
  // autenticada antes de llegar aquí. Comprobarla primero es lo que permite
  // seguir distinguiendo, con un `userAccountId` que no resuelve a ninguna
  // cuenta, «no hay observador» de «no tiene acceso a esta trampa» (la
  // prueba de ese caso fija ese motivo explícitamente).
  const cuenta = await prisma.userAccount.findUnique({
    where: { id: userAccountId },
    select: { personId: true },
  });
  if (!cuenta?.personId) {
    return { clientDraftId: m.clientDraftId, status: "rejected", reason: "observer_self_missing" };
  }

  const trampa = await prisma.specimen.findUnique({
    where: { id: m.specimenId },
    select: { id: true, locationId: true, specimenType: true },
  });
  if (!trampa || trampa.specimenType !== "trap") {
    return { clientDraftId: m.clientDraftId, status: "rejected", reason: "trap_not_found" };
  }
  try {
    await requireTrapAccess(userAccountId, trampa.locationId);
  } catch (error) {
    if (error instanceof TrapAccessError) {
      return { clientDraftId: m.clientDraftId, status: "rejected", reason: error.message };
    }
    throw error;
  }

  // A9 fix-final (M2) — el lookup por `clientDraftId` va DESPUÉS del control
  // de acceso de arriba, y sólo cuenta como duplicado si la fila encontrada
  // es de la MISMA trampa. Ver el docstring de la función.
  const yaEstaba = await prisma.specimenObservation.findUnique({
    where: { clientDraftId: m.clientDraftId },
    select: { id: true, specimenId: true },
  });
  if (yaEstaba) {
    if (yaEstaba.specimenId !== m.specimenId) {
      return { clientDraftId: m.clientDraftId, status: "rejected", reason: "client_draft_id_used_by_other_specimen" };
    }
    return { clientDraftId: m.clientDraftId, status: "duplicate", id: yaEstaba.id };
  }

  try {
    // `exigeValorEnumerado` sólo devuelve un valor "falsy" cuando `m.brocaLevel`
    // llega vacío o nulo — un valor no vacío pero inválido ya lanza DENTRO de
    // ella. Por eso la razón aquí es "vino vacío", la misma que usa el parseo
    // (`broca_level_required` en `parsearMutaciones.ts`) y no
    // `..._not_valid`, que describiría un valor que en este punto no existe.
    const brocaLevel = exigeValorEnumerado(m.brocaLevel, TrapCaptureLevel, "brocaLevel");
    if (!brocaLevel) throw new ValorEnumeradoInvalido("broca_level_required");
    const fila = await recordTrapCheck(userAccountId, {
      specimenId: m.specimenId,
      observedAt: m.observedAt,
      brocaLevel,
      captureCount: m.captureCount ?? null,
      otherInsects: m.otherInsects ?? null,
      otherInsectsNote: m.otherInsectsNote ?? null,
      cleaned: m.cleaned ?? null,
      liquidChanged: m.liquidChanged ?? null,
      lureRecharged: m.lureRecharged ?? null,
      observerPersonId: cuenta.personId,
      provenanceClass: "direct_observation",
      clientDraftId: m.clientDraftId,
    });
    return { clientDraftId: m.clientDraftId, status: "applied", id: fila.id };
  } catch (error) {
    // Carrera: mismo argumento que `aplicarCapturaDeParcela` — dos llamadas
    // con el mismo `clientDraftId` pueden pasar las dos el `findUnique` de
    // arriba antes de que la primera termine su `create`.
    if (esCarreraDeClientDraftId(error)) {
      const ganador = await prisma.specimenObservation.findUnique({
        where: { clientDraftId: m.clientDraftId },
        select: { id: true },
      });
      if (ganador) return { clientDraftId: m.clientDraftId, status: "duplicate", id: ganador.id };
    }
    if (
      error instanceof TrapValidationError ||
      error instanceof TrapAccessError ||
      error instanceof ValorEnumeradoInvalido
    ) {
      return { clientDraftId: m.clientDraftId, status: "rejected", reason: error.message };
    }
    throw error;
  }
}

export async function pushFieldEvents(
  userAccountId: string,
  deviceId: string,
  mutations: PushMutation[],
): Promise<PushResult[]> {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { id: true, revokedAt: true },
  });
  // Un aparato desconocido y uno revocado se distinguen en el mensaje pero no
  // en el efecto: ninguno escribe. Se dicen distintos porque quien lo lea
  // necesita saber si le falta registrar el aparato o si alguien se lo quitó.
  if (!device) throw new DeviceError("device_not_found");
  if (device.revokedAt) throw new DeviceError("device_revoked");

  const results: PushResult[] = [];

  // En el orden en que llegan, que es el orden en que el operador los anotó.
  // Importa aunque hoy ningún evento dependa de otro: un rechazo se lee junto
  // a lo que el operador recuerda haber hecho, y reordenarlos lo haría ilegible.
  for (const m of mutations) {
    // A9.5 — una mutación de apiario se delega a su servicio, que ya trae la
    // compuerta, la idempotencia y el audit. Lo único que se hace aquí es
    // distinguir `applied` de `duplicate`, que es lo que el protocolo promete
    // informar y el servicio no dice.
    if (m.kind === "inspection" || m.kind === "colony_event") {
      const resultado = await aplicarMutacionDeApiario(userAccountId, m);
      results.push(resultado);
      continue;
    }

    if (m.kind === "colony_end") {
      results.push(await aplicarFinDeColonia(userAccountId, m));
      continue;
    }

    if (m.kind === "varroa_count") {
      results.push(await aplicarConteoDeVarroa(userAccountId, m));
      continue;
    }

    if (m.kind === "soil_sample" || m.kind === "foliar_sample" || m.kind === "soil_profile" || m.kind === "planting_cohort") {
      results.push(await aplicarCapturaDeParcela(userAccountId, m));
      continue;
    }

    if (m.kind === "trap_check") {
      results.push(await aplicarRevisionDeTrampa(userAccountId, m));
      continue;
    }

    // La comprobación previa es lo que distingue `applied` de `duplicate`.
    // `recordFieldEvent` también la hace —tiene que ser seguro por su cuenta,
    // porque el formulario web lo llama directo— pero devuelve la fila sin
    // decir si la acaba de crear, y esa diferencia es justo lo que el
    // protocolo promete informar.
    const existing = await prisma.fieldEvent.findUnique({
      where: { clientDraftId: m.clientDraftId },
      select: { id: true },
    });
    if (existing) {
      results.push({ clientDraftId: m.clientDraftId, status: "duplicate", id: existing.id });
      continue;
    }

    try {
      const event = await recordFieldEvent(userAccountId, {
        fieldSessionId: m.fieldSessionId,
        eventKindValueId: m.eventKindValueId,
        occurredAt: m.occurredAt,
        position: m.position,
        operatorPersonId: m.operatorPersonId,
        notes: m.notes,
        measurementId: m.measurementId,
        quantityEventId: m.quantityEventId,
        specimenObservationId: m.specimenObservationId,
        assetId: m.assetId,
        harvestEventId: m.harvestEventId,
        lotTransformationId: m.lotTransformationId,
        // Fijo, nunca elegible por el operador — misma disciplina que
        // `recordFieldEventFormAction` en la web y que toda la base de código
        // para `provenanceClass` (T12.6): quien está en el bloque lo vio.
        provenanceClass: "direct_observation",
        capture: { recordedAt: m.recordedAt ?? null, captureDeviceId: deviceId },
        clientDraftId: m.clientDraftId,
      });
      results.push({ clientDraftId: m.clientDraftId, status: "applied", id: event.id });
    } catch (error) {
      if (error instanceof FieldSessionValidationError || error instanceof LocationAccessError) {
        results.push({ clientDraftId: m.clientDraftId, status: "rejected", reason: error.message });
        continue;
      }
      throw error;
    }
  }

  // Después de escribir, no antes: `lastSeenAt` significa «este aparato
  // sincronizó», y marcarlo antes lo convertiría en «lo intentó».
  await prisma.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } });

  return results;
}
