import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { objectStorageProvider } from "../integrations/storage";
import { requireLocationAttributeAccess } from "../traceability/locations";
import { FieldSessionValidationError } from "../traceability/fieldSessions";
import { recordAuditEvent } from "../audit";

/**
 * P4 §7 — la cola de medios, y la decisión de modelo que la hace posible.
 *
 * **Una foto de campo ES un `FieldEvent`, no un adjunto colgado de otro.** El
 * catálogo `event_kind` ya trae `foto`, `video` y `nota_de_voz`, y la relación
 * existente va `FieldEvent.assetId → Asset`: el evento apunta a la foto.
 *
 * La lectura obvia de §7 —«que una foto pueda llegar días después de la
 * observación que documenta»— sugiere colgarla de un evento anterior, lo que
 * exigiría **actualizar** ese evento. Eso está descartado, y no por gusto:
 * `FieldEvent` es append-only, y el pull por cursor de §5 **ya depende de
 * ello** — usa `createdAt` en vez de `updatedAt` precisamente porque nada lo
 * modifica. Un `UPDATE` aquí haría que ningún dispositivo se enterara nunca de
 * que la foto llegó. El fallo sería invisible: la foto estaría en la base y no
 * en ningún aparato.
 *
 * Lo que se conserva de la intención de §7 es lo que importaba: la foto viaja
 * en su **propia cola**, con su propio reintento, y aterriza cuando aterrice.
 * Queda junto a lo que documenta porque comparten `FieldSession` y se ordenan
 * por `occurredAt` — que es para lo que P2 §4 llama a `FieldEvent` «una espina
 * dorsal, no un reemplazo».
 *
 * **Subida en dos pasos**, la misma forma que `lib/traceability/media.ts`: el
 * servidor firma una URL y **nunca sostiene los bytes**. Entre paso y paso no
 * hay fila de `Asset`, así que una subida abandonada no deja una fila
 * apuntando a nada — deja un objeto huérfano en el bucket, que es el problema
 * que `PENDING_IMPLEMENTATIONS/002` ya tiene nombrado.
 */

const BUCKET = "nectar-originals";
const PREFIJO = "nectar-originals/field";

export class FieldMediaError extends Error {}

/** mime → el tipo de evento del catálogo. Lo que no encaja no se inventa. */
function tipoDeEvento(mimeType: string): "foto" | "video" | "nota_de_voz" {
  if (mimeType.startsWith("image/")) return "foto";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "nota_de_voz";
  throw new FieldMediaError("mime_no_soportado");
}

async function sesionAccesible(userAccountId: string, fieldSessionId: string) {
  const s = await prisma.fieldSession.findUnique({
    where: { id: fieldSessionId },
    select: { id: true, locationId: true, operatorPersonId: true },
  });
  if (!s) throw new FieldSessionValidationError("session_not_found");
  await requireLocationAttributeAccess(userAccountId, s.locationId);
  return s;
}

export interface RequestFieldMediaInput {
  fieldSessionId: string;
  originalFilename: string;
  contentType: string;
}

/**
 * Paso 1 de 2. Acuña la clave y firma la URL; no crea ninguna fila.
 *
 * La clave la genera el SERVIDOR y no el aparato: una clave elegida por el
 * cliente le dejaría escribir donde quisiera del bucket, y el prefijo es lo
 * único que ata un objeto a la jornada que lo justifica — se vuelve a
 * comprobar al finalizar.
 */
export async function requestFieldMediaUpload(userAccountId: string, input: RequestFieldMediaInput) {
  tipoDeEvento(input.contentType); // rechaza pronto lo que no vamos a poder registrar
  const sesion = await sesionAccesible(userAccountId, input.fieldSessionId);

  const ext = input.originalFilename.includes(".") ? input.originalFilename.split(".").pop() : undefined;
  const storageKey = `${PREFIJO}/${sesion.id}/${randomUUID()}${ext ? `.${ext}` : ""}`;
  const { uploadUrl } = await objectStorageProvider.putObject({ key: storageKey, contentType: input.contentType });
  return { uploadUrl, storageKey };
}

export interface FinalizeFieldMediaInput {
  fieldSessionId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  /** La clave de idempotencia del EVENTO, la misma que usa el push de §4. */
  clientDraftId: string;
  occurredAt: Date;
  recordedAt?: Date | null;
  deviceId?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  position?: { latitude?: number | null; longitude?: number | null; accuracyM?: number | null };
}

/**
 * Paso 2 de 2: la foto pasa a existir como hecho.
 *
 * Idempotente por `clientDraftId` igual que `recordFieldEvent`, y por la misma
 * razón: una respuesta perdida no puede convertirse en dos fotos del mismo
 * momento. La comprobación va antes que nada, incluido el RBAC — este medio ya
 * se aceptó una vez, y volver a validarlo contra un mundo que cambió mientras
 * el aparato no tenía señal convertiría un reintento inocuo en un error que el
 * operador no puede resolver.
 *
 * `Asset` y `FieldEvent` se crean en **una** transacción, con el audit dentro:
 * una foto en el bucket cuyo evento no llegó a existir es un medio invisible, y
 * un evento apuntando a un `Asset` que no existe es peor. Módulo nuevo, `tx`
 * desde el principio — el coste sólo existe al convertir lo viejo.
 */
export async function finalizeFieldMedia(userAccountId: string, input: FinalizeFieldMediaInput) {
  const yaExiste = await prisma.fieldEvent.findUnique({
    where: { clientDraftId: input.clientDraftId },
    include: { asset: true },
  });
  if (yaExiste) return yaExiste;

  const sesion = await sesionAccesible(userAccountId, input.fieldSessionId);

  // El prefijo se re-comprueba aquí y no sólo al firmar: entre los dos pasos
  // hay una llamada del cliente, y confiar en que devuelva la clave que le
  // dimos es confiar en el cliente para decidir dónde escribe.
  if (!input.storageKey.startsWith(`${PREFIJO}/${sesion.id}/`)) {
    throw new FieldMediaError("storage_key_fuera_de_la_jornada");
  }
  if (input.sizeBytes <= 0) throw new FieldMediaError("tamano_invalido");

  const valor = tipoDeEvento(input.mimeType);
  const kind = await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value: valor, catalog: { key: "event_kind" } },
    select: { id: true, aliasOfId: true },
  });

  // Que la Persona exista, con el mismo criterio que `recordFieldEvent`: un id
  // mal tecleado tiene que decir qué pasa en vez de reventar contra la clave
  // foránea con un error opaco de base de datos. Allí faltaba y lo señaló una
  // revisión; aquí faltaba igual y lo destapó un flip-test que no discriminaba.
  //
  // NO es un control de permisos: `operatorPersonId` es atribución, no
  // autoridad, y el operador suele ser una Persona sin cuenta.
  if (input.operatorPersonId) {
    const persona = await prisma.person.findUnique({
      where: { id: input.operatorPersonId }, select: { id: true },
    });
    if (!persona) throw new FieldMediaError("operator_not_found");
  }

  const cuenta = await prisma.userAccount.findUniqueOrThrow({
    where: { id: userAccountId },
    select: { personId: true },
  });

  const { latitude = null, longitude = null, accuracyM = null } = input.position ?? {};

  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({
      data: {
        assetType: valor === "foto" ? "photo" : valor === "video" ? "video" : "audio",
        storageKey: input.storageKey,
        storageBucket: BUCKET,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalFilename: input.originalFilename,
        creatorPersonId: input.operatorPersonId ?? sesion.operatorPersonId ?? cuenta.personId,
        capturedAt: input.occurredAt,
        // P2 §6. La posición va también en el Asset y no sólo en el evento: es
        // el sitio donde se tomó la foto, que es un hecho de la foto. Se
        // escriben juntas y nunca se actualizan, así que no pueden divergir.
        latitude,
        longitude,
        accuracyM,
        status: "approved",
        classification: "internal",
        provenanceClass: "direct_observation",
        createdBy: userAccountId,
      },
    });

    const evento = await tx.fieldEvent.create({
      data: {
        fieldSessionId: sesion.id,
        eventKindValueId: kind.aliasOfId ?? kind.id,
        occurredAt: input.occurredAt,
        latitude,
        longitude,
        accuracyM,
        operatorPersonId: input.operatorPersonId ?? sesion.operatorPersonId,
        notes: input.notes ?? null,
        assetId: asset.id,
        provenanceClass: "direct_observation",
        recordedAt: input.recordedAt ?? null,
        deviceId: input.deviceId ?? null,
        clientDraftId: input.clientDraftId,
        createdBy: userAccountId,
      },
      include: { asset: true },
    });

    await recordAuditEvent({
      actorUserAccountId: userAccountId,
      operation: "field_media.finalize",
      entityType: "field_event",
      entityId: evento.id,
      after: evento,
      sourceInterface: "sync.field-media",
    }, tx);

    return evento;
  });
}
