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

import { classifyDraftAge, STALE_WARNING_DAYS, STALE_PURGE_DAYS } from "./draftAge";

const DB_NAME = "nectar-field-offline";
const DB_VERSION = 1;
const STORE = "drafts";
const DEVICE_KEY = "nn-field-device-id";

export type DraftStatus = "pending" | "error";

export interface FieldEventDraft {
  /**
   * El id LOCAL del borrador en IndexedDB. Para casi todos los tipos de
   * mutación es TAMBIÉN el `clientDraftId` que ve el servidor —
   * `construirMutacionDesdeBorrador`, más abajo, lo usa como respaldo—,
   * pero no para `trap_check` desde la Tarea 11: ese payload ya trae su
   * propia clave (`construirPayloadDeRevisionDeTrampa`), y es ÉSA la que
   * viaja, no `id`. Ver el docstring de `construirMutacionDesdeBorrador`.
   */
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
  avisarDeCambio();
  return draft;
}

/**
 * El formulario y el contador son componentes hermanos sin estado compartido, y
 * un evento de ventana es todo el mecanismo que hace falta — el mismo que usa
 * `OfflineSyncIndicator` en apiario, y por la misma razón: mover un número no
 * justifica un contexto ni pasar props por tres niveles.
 *
 * **Se avisa desde aquí y no desde el componente** para que no dependa de que
 * quien encole se acuerde. Sin esto, anotar sin señal dejaba el contador en
 * «nada pendiente» y el botón de sincronizar DESHABILITADO: el operador no
 * podía enviar su propio trabajo sin recargar la página, y nada en pantalla le
 * decía que hiciera falta. Encontrado recorriendo el modo avión, no leyendo.
 */
export const FIELD_DRAFTS_CHANGED_EVENT = "nn-field-drafts-changed";

function avisarDeCambio(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FIELD_DRAFTS_CHANGED_EVENT));
}

/**
 * A4 fix-final — se dispara cuando `syncFieldEvents` INTENTA sincronizar,
 * sin importar el resultado (aplicado, rechazado, o servidor caído).
 *
 * **Por qué existe.** La ronda de trampas tiene una SEGUNDA cola, la de
 * fotos (`lib/sync/trapPhotoQueue.ts`), que vive aparte porque guarda
 * `Blob`s. Antes de este arreglo, sincronizar las revisiones desde
 * `FieldSyncControls` —el botón genérico, compartido por todos los
 * formularios de campo— no le decía nada a esa segunda cola: una foto que
 * había fallado al subir se quedaba pendiente sin que nada la reintentara
 * hasta que alguien capturara OTRA foto en otra tarjeta (revisión final,
 * I5). Este evento es el enganche: `SincronizarFotosDeRonda` lo escucha y
 * reintenta su propia cola cada vez que CUALQUIER sincronización de
 * revisiones ocurre en la página, sin que este módulo tenga que importar
 * nada de fotos ni de trampas — la mayoría de formularios que usan
 * `syncFieldEvents` no tienen fotos, y no deben pagar por esa dependencia.
 */
export const FIELD_EVENTS_SYNCED_EVENT = "nn-field-events-synced";

function avisarDeSincronizacion(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FIELD_EVENTS_SYNCED_EVENT));
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
  avisarDeCambio();
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
  const { id } = await leerJson<{ id: string }>(res, "POST /api/v1/devices");
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

/**
 * P4 §10 — los borradores sin sincronizar no viven para siempre.
 *
 * **Esto BORRA trabajo de campo que no está en ningún otro sitio**, y es
 * deliberado: A5.5 §4 lo decidió como la mitigación del aparato perdido, porque
 * los borradores están en IndexedDB **en claro** y cifrarlos dejaría la clave en
 * el mismo almacenamiento que protege. La ventana se acota en vez de blindarse.
 *
 * El invariante que lo hace humano —y que un test de apiario vigila desde A5.5—
 * es que **se avisa antes de borrar**: 7 días de aviso, 21 de purga. Si el
 * umbral de aviso llegara a igualar al de purga, el borrado caería sin que
 * nadie hubiera visto una advertencia.
 *
 * Se devuelve lo purgado para que la pantalla lo diga. Una purga silenciosa es
 * indistinguible de haber perdido los datos.
 */
export async function purgeStaleFieldDrafts(
  ahora: number = Date.now(),
): Promise<{ purgados: number; avisados: number }> {
  const drafts = await listFieldEventDrafts();
  let purgados = 0;
  let avisados = 0;
  for (const d of drafts) {
    const veredicto = classifyDraftAge(d.createdAt, ahora);
    if (veredicto === "purge") {
      await discardFieldEventDraft(d.id);
      purgados++;
    } else if (veredicto === "warn") {
      avisados++;
    }
  }
  return { purgados, avisados };
}

export { STALE_WARNING_DAYS, STALE_PURGE_DAYS };

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

/**
 * Lee el JSON de una respuesta, o lanza diciendo QUÉ llegó en su lugar.
 *
 * **Por qué existe.** Medido contra el artefacto vivo el 2026-09-09: un POST a
 * una ruta inexistente contesta **200 con la página HTML de not-found** —un GET
 * a la misma ruta contesta 404—. `clasificarRespuesta(200)` dice «aplicar», y
 * el `res.json()` siguiente revienta con:
 *
 *     SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 *
 * que no nombra ni la ruta, ni el estado, ni lo que llegó.
 *
 * **No hay pérdida de datos y esto no la arregla**: el throw ocurre antes de
 * descartar ningún borrador, así que la cola queda intacta. Lo que arregla es
 * el diagnóstico, que es lo que cuesta tiempo el día que pasa.
 */
export async function leerJson<T>(res: Response, contexto: string): Promise<T> {
  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.toLowerCase().includes("json")) {
    throw new Error(
      `${contexto}: la respuesta ${res.status} no es JSON sino ${tipo || "sin content-type"}. ` +
        `Un POST a una ruta que no existe contesta 200 con HTML; comprueba la ruta.`,
    );
  }
  return (await res.json()) as T;
}

type ServerResult = { clientDraftId: string; status: "applied" | "duplicate" | "rejected"; reason?: string };

/**
 * Tarea 11, fix round 1 — la mutación que viaja por la red para UN borrador.
 *
 * **La clave que manda es la del PAYLOAD, no la del borrador — cuando el
 * payload trae una.** Los cuatro tipos de captura de parcela que no llevan su
 * propio `clientDraftId` (`soil_sample`, `foliar_sample`, `soil_profile`,
 * `planting_cohort`; ver `lib/sync/parcelaPayload.ts`) siguen usando `d.id`
 * exactamente como antes de este arreglo — es el único id que tienen—.
 * `trap_check` es el primero que SÍ trae uno propio
 * (`construirPayloadDeRevisionDeTrampa`), la misma clave que
 * `RondaDeTrampaForm` pone en el campo oculto y que el camino CON señal
 * (`recordRoundTrapCheckFormAction`) también usa. Antes de este arreglo, esta
 * misma línea hacía `{ ...d.payload, clientDraftId: d.id }` — el spread
 * seguido de la sobreescritura tira SIEMPRE la clave del payload, así que la
 * fila que el servidor guardaba llevaba la clave de la cola, nunca la del
 * formulario, y la foto de la Tarea 12 no podía encontrar la revisión que
 * acababa de crear sin señal. Revisión Task 11, hallazgo Crítico #1.
 *
 * Pura y exportada para poder probarla sin IndexedDB — igual que
 * `clasificarRespuesta` más arriba en este mismo archivo.
 */
export function construirMutacionDesdeBorrador(
  d: FieldEventDraft,
): Record<string, unknown> & { clientDraftId: string } {
  const propia = d.payload.clientDraftId;
  const clientDraftId = typeof propia === "string" && propia !== "" ? propia : d.id;
  return { ...d.payload, clientDraftId };
}

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
  // A4 fix-final — se avisa al ENTRAR, no al salir: un formulario con foto
  // (la ronda de trampas) necesita reintentar su propia cola cada vez que se
  // intenta ésta, sea cual sea el resultado.
  avisarDeSincronizacion();
  const drafts = (await listFieldEventDrafts()).filter((d) => d.status === "pending" || d.status === "error");
  if (drafts.length === 0) {
    return { applied: 0, duplicate: 0, rejected: 0, stillPending: 0, serverUnavailable: false };
  }

  const deviceId = await ensureDeviceId();
  // La clave que se manda es la que decide `construirMutacionDesdeBorrador`
  // (la del payload si trae una propia, `d.id` si no) — y es la MISMA clave
  // por la que hay que buscar el borrador cuando vuelva el resultado, más
  // abajo: el servidor devuelve el `clientDraftId` que recibió, no `d.id`.
  const mutaciones = drafts.map((d) => ({ draft: d, mutacion: construirMutacionDesdeBorrador(d) }));
  const porClaveDeEnvio = new Map(mutaciones.map(({ draft, mutacion }) => [mutacion.clientDraftId, draft]));
  const res = await fetch("/api/v1/sync/field-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceId,
      mutations: mutaciones.map(({ mutacion }) => mutacion),
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

  const { results } = await leerJson<{ results: ServerResult[] }>(res, "POST /api/v1/sync/field-events");
  const resumen: SyncSummary = { applied: 0, duplicate: 0, rejected: 0, stillPending: 0, serverUnavailable: false };

  for (const r of results) {
    const draft = porClaveDeEnvio.get(r.clientDraftId);
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
