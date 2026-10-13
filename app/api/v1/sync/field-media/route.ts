/**
 * P4 §7 — la cola de medios, en dos pasos.
 *
 * `POST ?paso=solicitar`  → devuelve una URL prefirmada y la clave.
 * `POST ?paso=finalizar`  → crea el Asset y su FieldEvent, idempotente.
 *
 * Entre los dos, el aparato sube los bytes **directo a R2**: el servidor nunca
 * los sostiene, que es lo que evita el límite de tamaño de una función
 * serverless y lo que ya hace `lib/traceability/media.ts`.
 *
 * Dos pasos en una ruta y no dos rutas porque son una sola operación desde
 * fuera —«guardar esta foto»— y separarlas obligaría a declarar, documentar y
 * vigilar dos entradas del router para un flujo que nunca se usa a medias.
 */
import { resolverPrincipal } from "../../../../../lib/sync/requestPrincipal";
import { negativaDelAparato } from "../../../../../lib/sync/deviceTokens";
import {
  requestFieldMediaUpload,
  finalizeFieldMedia,
  FieldMediaError,
} from "../../../../../lib/sync/fieldMedia";
import { FieldSessionValidationError } from "../../../../../lib/traceability/fieldSessions";
import { LocationAccessError } from "../../../../../lib/traceability/locations";

export const dynamic = "force-dynamic";

const fecha = (v: unknown): Date | null => {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export async function POST(request: Request) {
  // P4 §2 — cookie o token de aparato, indistinto para esta ruta.
  const user = await resolverPrincipal(request);
  if (!user) return Response.json({ error: "not_authenticated" }, { status: 401 });
  // Los dos pasos escriben —uno firma una subida, el otro crea la foto—, así que
  // un aparato revocado no pasa de aquí aunque su access siga vigente.
  const negativa = await negativaDelAparato(user.deviceId);
  if (negativa) return Response.json({ error: negativa }, { status: 403 });

  const paso = new URL(request.url).searchParams.get("paso");
  if (paso !== "solicitar" && paso !== "finalizar") {
    return Response.json({ error: "paso_desconocido" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const fieldSessionId = body.fieldSessionId;
  if (typeof fieldSessionId !== "string") {
    return Response.json({ error: "field_session_id_required" }, { status: 400 });
  }

  try {
    if (paso === "solicitar") {
      const { originalFilename, contentType } = body;
      if (typeof originalFilename !== "string" || typeof contentType !== "string") {
        return Response.json({ error: "filename_y_content_type_requeridos" }, { status: 400 });
      }
      const r = await requestFieldMediaUpload(user.userAccountId, {
        fieldSessionId, originalFilename, contentType,
      });
      return Response.json(r, { status: 200 });
    }

    // Por token, el aparato lo dice el token: el `deviceId` del cuerpo tiene que
    // ser el suyo, o la foto quedaría atribuida a un aparato que no la tomó. Por
    // cookie (`deviceId === null`) no hay aparato propio y sigue siendo opcional.
    if (user.deviceId !== null && body.deviceId !== user.deviceId) {
      return Response.json({ error: "device_mismatch" }, { status: 403 });
    }

    const occurredAt = fecha(body.occurredAt);
    if (
      typeof body.storageKey !== "string" || typeof body.mimeType !== "string" ||
      typeof body.originalFilename !== "string" || typeof body.clientDraftId !== "string" ||
      typeof body.sizeBytes !== "number" || !occurredAt
    ) {
      return Response.json({ error: "finalizar_malformado" }, { status: 400 });
    }

    const evento = await finalizeFieldMedia(user.userAccountId, {
      fieldSessionId,
      storageKey: body.storageKey,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      originalFilename: body.originalFilename,
      clientDraftId: body.clientDraftId,
      occurredAt,
      recordedAt: fecha(body.recordedAt),
      deviceId: typeof body.deviceId === "string" ? body.deviceId : null,
      operatorPersonId: typeof body.operatorPersonId === "string" ? body.operatorPersonId : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      position: (body.position ?? undefined) as never,
    });
    return Response.json({ id: evento.id, assetId: evento.assetId }, { status: 200 });
  } catch (error) {
    // Un no del servidor, no una caída: el cliente lo marca error y no lo
    // reintenta para siempre. Cualquier otra cosa sube y da 500, que el
    // cliente lee como «no llegué» y deja el medio en la cola.
    if (
      error instanceof FieldMediaError ||
      error instanceof FieldSessionValidationError ||
      error instanceof LocationAccessError
    ) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
