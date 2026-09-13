import { prisma } from "../db";
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
  | MutacionDeConteoDeVarroa;

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
  note?: string | null;

  // --- Anexo B §2.2, estado de la colonia. Viajan como CADENAS porque así salen
  // del formulario y del cuerpo JSON, y los valida `./estadoDeColonia` dentro del
  // servicio — no se cuelan en el enum con `as never`.
  population?: string | null;
  beeCoveredFrames?: number | string | null;
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
  /**
   * A9 · Anexo B §3 — «alcanza hasta». **Fecha ya parseada**, no cadena: el
   * parseo la convierte con `fechaDeDia` porque es un campo de DÍA. Pasarla como
   * texto haría que Prisma la interpretara por su cuenta, que es el fallo que
   * tumbó la creación de colmenas el 2026-09-11.
   */
  coverageUntil?: Date | null;
  /** Cómo se dejó el alimento. Cadena; la valida el servicio. */
  feedingMethod?: string | null;
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
            note: m.note ?? null,
            // Anexo B §2.2 — se pasan tal cual llegan; el servicio los valida.
            population: m.population ?? null,
            beeCoveredFrames: m.beeCoveredFrames ?? null,
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
            feedingMaterial: m.feedingMaterial ?? null,
            feedingQuantity: m.feedingQuantity ?? null,
            feedingUnit: m.feedingUnit ?? null,
            treatmentProduct: m.treatmentProduct ?? null,
            treatmentDose: m.treatmentDose ?? null,
            treatmentDoseUnit: m.treatmentDoseUnit ?? null,
            treatmentBatchLabel: m.treatmentBatchLabel ?? null,
            treatmentWithdrawalDays: m.treatmentWithdrawalDays ?? null,
            coverageUntil: m.coverageUntil ?? null,
            feedingMethod: m.feedingMethod ?? null,
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
      error instanceof AlimentacionInvalida
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
