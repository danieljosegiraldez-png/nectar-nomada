import { prisma } from "../db";
import {
  recordFieldEvent,
  FieldSessionValidationError,
  LocationAccessError,
  type Coordinates,
} from "../traceability/fieldSessions";

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

export type PushMutation = {
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

export type PushResult =
  | { clientDraftId: string; status: "applied"; id: string }
  | { clientDraftId: string; status: "duplicate"; id: string }
  | { clientDraftId: string; status: "rejected"; reason: string };

/** El lote entero se niega: el aparato no existe o está revocado. */
export class DeviceError extends Error {}

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
