/**
 * P4 §11 — cola local de eventos de campo, y el push por lotes que la vacía.
 *
 * **Por qué existe habiendo ya `lib/apiary/offlineQueue.ts`, dicho para que no
 * parezca un descuido.** Aquella cola sincroniza **de una en una** (su
 * `syncAll` llama a un `Syncer` por borrador) porque su protocolo es de una en
 * una. El de P4 es por lotes con resultado por mutación, que es otra forma, no
 * un parámetro más. Y refactorizar una cola offline que funciona y sirve a
 * otra pantalla, para dar de comer a una tercera, es cómo se rompe lo que ya
 * andaba.
 *
 * **La deuda queda escrita:** el audit §18 dice «generalize it rather than
 * replacing it», y eso sigue siendo lo correcto. El momento es cuando apiario
 * pase a push por lotes; entonces las dos colapsan en ésta y `lib/apiary/`
 * pasa a ser un envoltorio. Hacerlo hoy mezclaría dos revisiones.
 *
 * Sólo cliente. `indexedDB` no existe en el servidor: nunca importar esto desde
 * un Server Component ni desde un módulo de servidor.
 */

const DB_NAME = "nectar-field-offline";
const DB_VERSION = 1;
const STORE = "drafts";
const DEVICE_KEY = "nn-field-device-id";

export type DraftStatus = "pending" | "error";

export interface FieldEventDraft {
  /** Es también el `clientDraftId` del servidor: la clave de idempotencia. */
  id: string;
  payload: Record<string, unknown>;
  createdAt: number;
  status: DraftStatus;
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

function newDraftId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
 * El guardado. Escribe a disco local **antes** de que la red entre en juego,
 * que es lo que hace que anotar algo en el bloque sea instantáneo haya señal o
 * no, y que lo ya anotado sobreviva a cerrar el navegador.
 */
export async function queueFieldEvent(payload: Record<string, unknown>): Promise<FieldEventDraft> {
  const draft: FieldEventDraft = { id: newDraftId(), payload, createdAt: Date.now(), status: "pending" };
  await write((s) => s.add(draft));
  return draft;
}

export async function listFieldEventDrafts(): Promise<FieldEventDraft[]> {
  const db = await openDb();
  const rows = await new Promise<FieldEventDraft[]>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as FieldEventDraft[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function discardFieldEventDraft(id: string): Promise<void> {
  await write((s) => s.delete(id));
}

/**
 * El aparato se registra una vez y su id se guarda en `localStorage`.
 *
 * Si el registro falla no se inventa un id: sin aparato no hay push, y un id
 * fabricado en el cliente haría que el servidor rechazara el lote entero con
 * `device_not_found` sin que nadie entendiera por qué.
 */
export async function ensureDeviceId(): Promise<string> {
  const guardado = localStorage.getItem(DEVICE_KEY);
  if (guardado) return guardado;

  const res = await fetch("/api/v1/devices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: navigator.userAgent.slice(0, 120), platform: "pwa" }),
  });
  if (!res.ok) throw new Error(`device_registration_failed_${res.status}`);
  const { id } = (await res.json()) as { id: string };
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

export interface SyncSummary {
  applied: number;
  duplicate: number;
  rejected: number;
  stillPending: number;
  /** El servidor no pudo responder. Nada se marcó como error: sigue en cola. */
  serverUnavailable: boolean;
}

/**
 * Qué significa el código de estado de un push, y por qué no basta con
 * `res.ok`.
 *
 * La primera versión de este módulo trataba **todo** `!res.ok` como rechazo, y
 * eso contradecía a su propia ruta: `app/api/v1/sync/field-events/route.ts`
 * deja subir los errores inesperados precisamente para que el cliente los lea
 * como «no llegué» y conserve la cola intacta. Un 500 marcaba las anotaciones
 * como rechazadas y le decía al operador que el servidor había negado su
 * trabajo, cuando lo que había pasado es que se cayó. Las dos mitades del mismo
 * diseño, escritas con una hora de diferencia, discrepaban.
 *
 * Se extrae como función pura por el mismo motivo que `classifyDraftAge` en la
 * cola de apiario: este repositorio no tiene `fake-indexeddb` ni entorno DOM,
 * así que lo que toca IndexedDB o `fetch` no se puede probar aquí. La decisión
 * sí, y es la parte que se puede equivocar en silencio.
 *
 * - `aplicar`   — el servidor respondió; hay un resultado por mutación que leer.
 * - `reintentar`— el servidor no pudo atender (caído, saturado, tiempo agotado).
 *                 Los borradores se quedan **pendientes**, no en error: nadie
 *                 evaluó su contenido.
 * - `rechazar`  — el servidor corrió y se negó al lote entero (aparato
 *                 revocado, petición mal formada). Reintentar no lo arreglará.
 */
export type DecisionDeRespuesta = "aplicar" | "reintentar" | "rechazar";

export function clasificarRespuesta(status: number): DecisionDeRespuesta {
  if (status >= 200 && status < 300) return "aplicar";
  // 5xx es el servidor cayéndose; 408 y 429 son «ahora no, vuelve». Ninguno de
  // los tres es un juicio sobre lo que el operador anotó.
  if (status >= 500 || status === 408 || status === 429) return "reintentar";
  return "rechazar";
}

type ServerResult = { clientDraftId: string; status: "applied" | "duplicate" | "rejected"; reason?: string };

/**
 * Vacía la cola en **una sola petición**, y aplica el resultado por mutación.
 *
 * La distinción que sostiene todo esto, heredada de A5/A0: si el `fetch` lanza,
 * la petición **no llegó** —sin señal, o cortada a mitad— y los borradores se
 * quedan en cola para el próximo intento, sin perder nada. Si el servidor
 * responde y **rechaza** una mutación, eso es un no terminal: se marca error
 * para que el operador lo vea, y no se reintenta contra algo que no puede
 * salir bien nunca.
 *
 * `duplicate` se trata como éxito y se descarta el borrador: significa que una
 * tanda anterior sí llegó y sólo se perdió la respuesta.
 */
export async function syncFieldEvents(): Promise<SyncSummary> {
  const drafts = (await listFieldEventDrafts()).filter((d) => d.status === "pending" || d.status === "error");
  if (drafts.length === 0) {
    return { applied: 0, duplicate: 0, rejected: 0, stillPending: 0, serverUnavailable: false };
  }

  const deviceId = await ensureDeviceId();
  const res = await fetch("/api/v1/sync/field-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceId,
      mutations: drafts.map((d) => ({ ...d.payload, clientDraftId: d.id })),
    }),
  });

  // El lote entero negado (aparato revocado) es una respuesta del servidor, no
  // una caída: marcarlo error evita reintentar para siempre algo que ya no va
  // a ser aceptado hasta que alguien reactive el aparato.
  const decision = clasificarRespuesta(res.status);
  if (decision === "reintentar") {
    // No se toca ni un borrador: nadie ha evaluado su contenido. Quedan
    // pendientes y el operador puede volver a darle a sincronizar.
    return { applied: 0, duplicate: 0, rejected: 0, stillPending: drafts.length, serverUnavailable: true };
  }
  if (decision === "rechazar") {
    const razon = `HTTP ${res.status}`;
    for (const d of drafts) await write((s) => s.put({ ...d, status: "error", errorMessage: razon }));
    return { applied: 0, duplicate: 0, rejected: drafts.length, stillPending: drafts.length, serverUnavailable: false };
  }

  const { results } = (await res.json()) as { results: ServerResult[] };
  const resumen: SyncSummary = { applied: 0, duplicate: 0, rejected: 0, stillPending: 0, serverUnavailable: false };

  for (const r of results) {
    const draft = drafts.find((d) => d.id === r.clientDraftId);
    if (!draft) continue;
    if (r.status === "rejected") {
      await write((s) => s.put({ ...draft, status: "error", errorMessage: r.reason ?? "rejected" }));
      resumen.rejected++;
    } else {
      await discardFieldEventDraft(draft.id);
      if (r.status === "applied") resumen.applied++;
      else resumen.duplicate++;
    }
  }

  resumen.stillPending = (await listFieldEventDrafts()).length;
  return resumen;
}
