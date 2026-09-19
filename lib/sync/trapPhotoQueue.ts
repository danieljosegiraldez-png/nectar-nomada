/**
 * P4 §4.3 extendido — cola local de fotos de la ronda de trampas, en IndexedDB.
 * Sólo cliente. Distinta de `lib/sync/offlineQueue.ts`: aquélla guarda JSON, ésta
 * guarda el `Blob` de la foto, que no cabe en la cola de mutaciones. Las dos
 * conviven: la revisión viaja por una, la foto por la otra, y se enganchan por
 * `revisionClientDraftId` en el servidor (`finalizeTrampaPhotoPorBorrador`).
 *
 * **Por qué pide la URL con `requestTrampaPhotoUploadAction` y no con la
 * genérica `requestLandAssetUploadAction`.** Ruling P2 del controlador (Tarea
 * 12): la foto de una revisión de trampa se autoriza con `requireTrapAccess`
 * (specimen:manage), no con `location:manage_attributes` — la misma persona
 * que puede registrar la revisión es la que puede subir su foto.
 */

import { requestTrampaPhotoUploadAction, finalizeTrampaPhotoPorBorradorAction } from "../../app/actions/traceability";

const DB_NAME = "nectar-trap-photo-offline";
const DB_VERSION = 1;
const STORE = "photos";

export interface FotoDeRondaPendiente {
  id: string;
  locationId: string;
  revisionClientDraftId: string;
  blob: Blob;
  originalFilename: string;
  contentType: string;
  createdAt: number;
  status: "pending" | "error";
  errorMessage?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function write(fn: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/**
 * A4 fix-final — mismo patrón que `FIELD_DRAFTS_CHANGED_EVENT` en
 * `offlineQueue.ts`: el contador de `SincronizarFotosDeRonda` y quien
 * encola son componentes hermanos sin estado compartido. Antes de este
 * arreglo, encolar una foto nueva o que un reintento fallara no le decía
 * nada al contador, que sólo se recontaba al montar o tras pulsar su
 * PROPIO botón — una foto nueva quedaba invisible hasta un remonte
 * (revisión final, I5).
 */
export const TRAP_PHOTO_DRAFTS_CHANGED_EVENT = "nn-trap-photo-drafts-changed";

function avisarDeCambioDeFoto(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TRAP_PHOTO_DRAFTS_CHANGED_EVENT));
}

/**
 * El guardado. Igual que `queueFieldEvent` en `offlineQueue.ts`: escribe a
 * disco local antes de que la red entre en juego, tenga o no señal el
 * dispositivo en este instante.
 */
export async function queueTrapPhoto(input: {
  locationId: string;
  revisionClientDraftId: string;
  file: File;
}): Promise<FotoDeRondaPendiente> {
  const draft: FotoDeRondaPendiente = {
    id: crypto.randomUUID(),
    locationId: input.locationId,
    revisionClientDraftId: input.revisionClientDraftId,
    blob: input.file,
    originalFilename: input.file.name,
    contentType: input.file.type,
    createdAt: Date.now(),
    status: "pending",
  };
  await write((s) => s.add(draft));
  avisarDeCambioDeFoto();
  return draft;
}

export async function listTrapPhotoDrafts(): Promise<FotoDeRondaPendiente[]> {
  const db = await openDb();
  const rows = await new Promise<FotoDeRondaPendiente[]>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as FotoDeRondaPendiente[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function discardTrapPhotoDraft(id: string): Promise<void> {
  await write((s) => s.delete(id));
  avisarDeCambioDeFoto();
}

/**
 * Qué hacer con la respuesta de finalizar. Pura, la misma razón que
 * `clasificarRespuesta` en `offlineQueue.ts`: lo que puede equivocarse en
 * silencio se extrae para poder probarlo sin IndexedDB, sin `fetch` y sin la
 * Server Action real.
 *
 * `"pendiente"` es la forma nueva de este archivo: la revisión no ha llegado
 * todavía, y NO es un rechazo — se deja en cola para reintentar, nunca se
 * engancha a otra revisión (spec §4.3).
 */
export function clasificarResultadoDeFoto(
  r: { ok: true } | { pendiente: true } | { error: string },
): "aplicar" | "reintentar" | "rechazar" {
  if ("ok" in r) return "aplicar";
  if ("pendiente" in r) return "reintentar";
  return "rechazar";
}

export interface SyncFotosSummary {
  applied: number;
  rejected: number;
  stillPending: number;
}

/**
 * Vacía la cola, foto por foto: el viaje de dos pasos (URL firmada, PUT,
 * finalizar) es por fotografía, a diferencia del lote único de
 * `syncFieldEvents`. Una foto sin señal a mitad de camino se queda en cola tal
 * cual, sin marcar error — nadie evaluó su contenido.
 */
export async function syncTrapPhotos(): Promise<SyncFotosSummary> {
  const fotos = (await listTrapPhotoDrafts()).filter((f) => f.status === "pending" || f.status === "error");
  let applied = 0;
  let rejected = 0;
  for (const foto of fotos) {
    try {
      // Fix round 1 (Tarea 12) — `foto.id` es el clientDraftId de ESTA foto,
      // el mismo en cada reintento (se generó una vez, en `queueTrapPhoto`,
      // y vive en IndexedDB): con él, `requestTrampaPhotoUploadAction`
      // deriva SIEMPRE la misma clave para esta foto, y un acuse perdido ya
      // no crea un segundo `Asset`.
      const paso1 = await requestTrampaPhotoUploadAction(
        foto.locationId,
        foto.originalFilename,
        foto.contentType,
        foto.id,
        // A6 fix-final — con qué revisión hay que comparar si la clave
        // derivada ya tiene un Asset: ver el docstring de
        // `requestTrampaPhotoUpload` en `landMedia.ts`.
        foto.revisionClientDraftId,
      );
      if ("error" in paso1) {
        await write((s) => s.put({ ...foto, status: "error", errorMessage: paso1.error }));
        avisarDeCambioDeFoto();
        rejected++;
        continue;
      }

      const subida = await fetch(paso1.uploadUrl, {
        method: "PUT",
        headers: { "content-type": foto.contentType },
        body: foto.blob,
      });
      if (!subida.ok) continue; // la red se cayó a mitad; se reintenta, no se descarta

      const paso2 = await finalizeTrampaPhotoPorBorradorAction(
        foto.locationId,
        paso1.storageKey,
        foto.contentType,
        foto.blob.size,
        foto.originalFilename,
        foto.revisionClientDraftId,
      );
      const decision = clasificarResultadoDeFoto(paso2);
      if (decision === "aplicar") {
        await discardTrapPhotoDraft(foto.id);
        applied++;
      } else if (decision === "rechazar" && "error" in paso2) {
        await write((s) => s.put({ ...foto, status: "error", errorMessage: paso2.error }));
        avisarDeCambioDeFoto();
        rejected++;
      }
      // "reintentar": se deja en cola tal cual, sin marcar error.
    } catch {
      // Sin señal a mitad de camino: se deja en cola.
    }
  }
  return { applied, rejected, stillPending: (await listTrapPhotoDrafts()).length };
}
