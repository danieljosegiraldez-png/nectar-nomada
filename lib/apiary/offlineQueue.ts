/**
 * A5/A0 (docs/implementation/25_OFFLINE_OPTIONS_ANALYSIS.md, Option B —
 * "minimal local draft"). A plain IndexedDB wrapper: no service worker, no
 * app-shell caching, no `idb`/`dexie` dependency (none existed in this
 * codebase before A5, per 25_'s own finding, and the vanilla API is small
 * enough here not to need one), no automatic conflict resolution — §0's
 * own finding already established `offline.sync_conflict` doesn't apply
 * to Inspection/ColonyEvent's append-only write shape, so there is
 * nothing to resolve, only to retry.
 *
 * Client-only. Never imported from a Server Component or a plain server
 * module — `indexedDB` does not exist there. Only `app/components/apiary/
 * *` ("use client") files should import this.
 */

const DB_NAME = "nectar-apiary-offline";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

export type DraftKind = "inspection" | "colonyEvent";
export type DraftStatus = "pending" | "error";

export interface DraftRecord<T = unknown> {
  // Doubles as the server-side clientDraftId (Inspection.clientDraftId /
  // ColonyEvent.clientDraftId) — the idempotent-sync key 25_'s §0 calls
  // for: a retried sync after a dropped response is a no-op, not a
  // duplicate row, because the server checks this id before inserting.
  id: string;
  kind: DraftKind;
  payload: T;
  createdAt: number;
  status: DraftStatus;
  errorMessage?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function generateDraftId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The "save" — writes synchronously to local storage before any network
 * involvement, the property that makes the golden-path tap (§4: "Nothing
 * unusual", one tap) feel instant whether or not there's signal, and
 * makes already-recorded data survive a restart unconditionally (25_ §1:
 * true "if and only if each submission writes to IndexedDB synchronously
 * with the local save, not merely to React state" — this is that write).
 */
export async function queueDraft<T>(kind: DraftKind, payload: T): Promise<DraftRecord<T>> {
  const record: DraftRecord<T> = { id: generateDraftId(), kind, payload, createdAt: Date.now(), status: "pending" };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return record;
}

export async function listDrafts(): Promise<DraftRecord[]> {
  const db = await openDb();
  const result = await new Promise<DraftRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as DraftRecord[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result.sort((a, b) => a.createdAt - b.createdAt);
}

async function putDraft(record: DraftRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function discardDraft(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export interface SyncOutcome {
  ok: boolean;
  errorKind?: "validation" | "access" | "unknown";
  message?: string;
}

type Syncer = (kind: DraftKind, payload: unknown) => Promise<SyncOutcome>;

/**
 * Attempts every pending/error draft once, in creation order. The
 * distinction that matters (§0, "explicit sync now, no automatic conflict
 * resolution"): if the sync call itself throws, the request never reached
 * the server (offline, or the connection dropped mid-flight) — the draft
 * stays queued for the next attempt, no data lost. If the call resolves
 * with `ok: false`, the server *did* run and rejected it (a real
 * validation or access error, not a connectivity problem) — the draft is
 * marked "error" and left for the operator to see and discard, not
 * silently retried forever against a request that can never succeed.
 */
export async function syncAll(syncer: Syncer): Promise<{ synced: number; errored: number; stillPending: number }> {
  const drafts = await listDrafts();
  const toSync = drafts.filter((d) => d.status === "pending" || d.status === "error");

  let synced = 0;
  let errored = 0;
  for (const draft of toSync) {
    try {
      const payload = draft.payload as Record<string, unknown>;
      const result = await syncer(draft.kind, { ...payload, clientDraftId: draft.id });
      if (result.ok) {
        await discardDraft(draft.id);
        synced++;
      } else {
        await putDraft({ ...draft, status: "error", errorMessage: result.message });
        errored++;
      }
    } catch {
      // Network/transport failure — leave pending as-is, retried on the
      // next "Sync now" tap or the next opportunistic auto-attempt.
    }
  }

  const stillPending = (await listDrafts()).filter((d) => d.status === "pending" || d.status === "error").length;
  return { synced, errored, stillPending };
}
