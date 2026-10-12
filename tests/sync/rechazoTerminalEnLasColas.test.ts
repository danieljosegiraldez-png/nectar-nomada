import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lo que las tres colas offline VUELVEN A RECOGER después de que el servidor dijo
 * que no — revisión de Codex del 2026-10-11, medida aquí por ejecución.
 *
 * **El defecto.** Las tres marcaban `error` un rechazo del servidor y, en el
 * intento siguiente, lo volvían a mandar, porque sus filtros recogían
 * `pending || error`. Sus propios comentarios decían lo contrario, y el spec lo
 * fija: «`rejected` es terminal: no se reintenta, y el operador lo ve»
 * (`docs/implementation/46_P4_API_Y_SINCRONIZACION.md` §12). No había bucle
 * dentro de una llamada ni se borraba nada: faltaba la condición terminal, y el
 * intento siguiente lo disparaba la propia pantalla —`RondaDeTrampaForm` al
 * registrar con señal, `OfflineSyncIndicator` con `online` y al encolar,
 * `SincronizarFotosDeRonda` con cada sincronización de revisiones—.
 *
 * **Decisiones de Daniel del mismo día**, que es lo que estas pruebas fijan:
 * 1. un rechazado sólo se descarta: ninguna sincronización lo vuelve a mandar;
 * 2. una sesión caducada (401) es como no tener señal: sigue pendiente y se dice;
 * 3. en apiario, un 403 del lote entero se trata igual que en campo: rechazado,
 *    con el motivo que mandó el servidor.
 *
 * **Cada caso terminal tiene su control al lado**, un rechazo NO terminal (503,
 * sin señal, 401, «la revisión todavía no llegó») que SÍ tiene que reenviarse. Sin
 * él, «no se reenvió» podría ser «la medición no ve ningún envío»: los controles
 * demuestran que `enviadosEnLaLlamada(1)` devuelve los ids cuando el segundo envío
 * existe. Y cada caso terminal afirma primero que el rechazo SE REGISTRÓ, porque
 * «no se reenvió» sobre un borrador que nunca se marcó no mide nada.
 *
 * Hermético: IndexedDB en memoria (`tests/helpers/indexedDbEnMemoria.ts`), `fetch`
 * falso y las dos acciones de foto mockeadas. Ni base ni red.
 */

vi.mock("../../app/actions/traceability", () => ({
  requestTrampaPhotoUploadAction: vi.fn(),
  finalizeTrampaPhotoPorBorradorAction: vi.fn(),
}));

import { finalizeTrampaPhotoPorBorradorAction, requestTrampaPhotoUploadAction } from "../../app/actions/traceability";
import { listDrafts, queueDraft, syncAll } from "../../lib/apiary/offlineQueue";
import { listFieldEventDrafts, queueFieldEvent, syncFieldEvents } from "../../lib/sync/offlineQueue";
import { listTrapPhotoDrafts, queueTrapPhoto, syncTrapPhotos } from "../../lib/sync/trapPhotoQueue";
import { instalarIndexedDbEnMemoria } from "../helpers/indexedDbEnMemoria";

const RUTA_DE_LOTE = "/api/v1/sync/field-events";
const fetchFalso = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
}

const llamadasAlLote = () => fetchFalso.mock.calls.filter(([url]) => url === RUTA_DE_LOTE);

/** Los `clientDraftId` de la llamada N al lote; ninguno si esa llamada no existió. */
function enviadosEnLaLlamada(n: number): string[] {
  const llamada = llamadasAlLote()[n];
  if (!llamada) return [];
  const cuerpo = JSON.parse(String(llamada[1]?.body)) as { mutations: Array<{ clientDraftId: string }> };
  return cuerpo.mutations.map((m) => m.clientDraftId);
}

beforeEach(() => {
  instalarIndexedDbEnMemoria();
  fetchFalso.mockReset();
  vi.stubGlobal("fetch", fetchFalso);
  // `ensureDeviceId` devuelve el id guardado sin volver a registrar: es lo que
  // hace que un aparato revocado mande SIEMPRE el mismo id.
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k === "nn-field-device-id" ? "aparato-de-prueba" : null),
    setItem: () => {},
    removeItem: () => {},
  });
  vi.mocked(requestTrampaPhotoUploadAction).mockReset();
  vi.mocked(finalizeTrampaPhotoPorBorradorAction).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cola de campo (`syncFieldEvents`): qué vuelve a mandar tras un rechazo", () => {
  const evento = { kind: "field_event", fieldSessionId: "sesion-1", note: "anotación" };

  it("control: un 503 deja el borrador pendiente y el intento siguiente lo reenvía", async () => {
    const d = await queueFieldEvent(evento);
    fetchFalso.mockResolvedValueOnce(json(503, { error: "unavailable" }));
    expect(await syncFieldEvents()).toMatchObject({ serverUnavailable: true, sessionExpired: false });
    expect((await listFieldEventDrafts()).map((x) => x.status)).toEqual(["pending"]);

    fetchFalso.mockResolvedValueOnce(json(200, { results: [{ clientDraftId: d.id, status: "applied" }] }));
    await syncFieldEvents();
    expect(enviadosEnLaLlamada(1)).toEqual([d.id]);
  });

  it("control: sin señal (el `fetch` lanza) el borrador sigue pendiente y se reenvía", async () => {
    const d = await queueFieldEvent(evento);
    fetchFalso.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(syncFieldEvents()).rejects.toThrow("Failed to fetch");

    fetchFalso.mockResolvedValueOnce(json(200, { results: [{ clientDraftId: d.id, status: "applied" }] }));
    await syncFieldEvents();
    expect(enviadosEnLaLlamada(1)).toEqual([d.id]);
  });

  it("una sesión caducada (401) deja el borrador pendiente, lo dice, y el intento siguiente lo reenvía", async () => {
    const d = await queueFieldEvent(evento);
    fetchFalso.mockResolvedValueOnce(json(401, { error: "not_authenticated" }));
    expect(await syncFieldEvents()).toMatchObject({
      sessionExpired: true,
      serverUnavailable: false,
      rejected: 0,
      stillPending: 1,
    });
    expect(await listFieldEventDrafts()).toMatchObject([{ id: d.id, status: "pending" }]);

    fetchFalso.mockResolvedValueOnce(json(200, { results: [{ clientDraftId: d.id, status: "applied" }] }));
    await syncFieldEvents();
    expect(enviadosEnLaLlamada(1)).toEqual([d.id]);
  });

  it("un 403 del lote (aparato revocado) queda en error con el motivo del servidor y no se reenvía", async () => {
    const d = await queueFieldEvent(evento);
    fetchFalso.mockResolvedValue(json(403, { error: "device_revoked" }));
    expect(await syncFieldEvents()).toMatchObject({ rejected: 1, stillPending: 0 });
    expect(await listFieldEventDrafts()).toMatchObject([{ id: d.id, status: "error", errorMessage: "device_revoked" }]);

    await syncFieldEvents();
    expect(enviadosEnLaLlamada(1)).toEqual([]);
  });

  it("un 403 sin cuerpo legible guarda el estado HTTP como motivo, no un motivo inventado", async () => {
    await queueFieldEvent(evento);
    fetchFalso.mockResolvedValueOnce(new Response("<!DOCTYPE html>", { status: 403, headers: { "content-type": "text/html" } }));
    await syncFieldEvents();
    expect(await listFieldEventDrafts()).toMatchObject([{ status: "error", errorMessage: "HTTP 403" }]);
  });

  it("una mutación rechazada no viaja otra vez cuando se encola otra con señal (lo que hace `RondaDeTrampaForm`)", async () => {
    const rechazada = await queueFieldEvent(evento);
    fetchFalso.mockResolvedValueOnce(
      json(200, { results: [{ clientDraftId: rechazada.id, status: "rejected", reason: "observer_self_missing" }] }),
    );
    await syncFieldEvents();
    expect(await listFieldEventDrafts()).toMatchObject([
      { id: rechazada.id, status: "error", errorMessage: "observer_self_missing" },
    ]);

    const nueva = await queueFieldEvent({ ...evento, note: "otra" });
    fetchFalso.mockResolvedValueOnce(json(200, { results: [{ clientDraftId: nueva.id, status: "applied" }] }));
    await syncFieldEvents();
    expect(enviadosEnLaLlamada(1)).toEqual([nueva.id]);
  });
});

describe("cola de apiario (`syncAll`): qué vuelve a mandar tras un rechazo", () => {
  const inspeccion = { colonyId: "colonia-1", note: "anotación" };

  it("control: sin señal (el `fetch` lanza) el borrador sigue pendiente y se reenvía", async () => {
    const d = await queueDraft("inspection", inspeccion);
    fetchFalso.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await syncAll()).toEqual({ synced: 0, errored: 0, stillPending: 1, sessionExpired: false });

    fetchFalso.mockResolvedValueOnce(json(200, { results: [{ clientDraftId: d.id, status: "applied" }] }));
    await syncAll();
    expect(enviadosEnLaLlamada(1)).toEqual([d.id]);
  });

  it("una sesión caducada (401) deja el borrador pendiente, lo dice, y el intento siguiente lo reenvía", async () => {
    const d = await queueDraft("inspection", inspeccion);
    fetchFalso.mockResolvedValueOnce(json(401, { error: "not_authenticated" }));
    expect(await syncAll()).toEqual({ synced: 0, errored: 0, stillPending: 1, sessionExpired: true });
    expect(await listDrafts()).toMatchObject([{ id: d.id, status: "pending" }]);

    fetchFalso.mockResolvedValueOnce(json(200, { results: [{ clientDraftId: d.id, status: "applied" }] }));
    await syncAll();
    expect(enviadosEnLaLlamada(1)).toEqual([d.id]);
  });

  it("un borrador rechazado queda en error y el intento siguiente no lo reenvía", async () => {
    const d = await queueDraft("inspection", inspeccion);
    fetchFalso.mockResolvedValueOnce(
      json(200, { results: [{ clientDraftId: d.id, status: "rejected", reason: "colony_not_found" }] }),
    );
    expect(await syncAll()).toMatchObject({ errored: 1, stillPending: 0 });
    expect(await listDrafts()).toMatchObject([{ id: d.id, status: "error", errorMessage: "colony_not_found" }]);

    // `OfflineSyncIndicator` dispara este segundo intento solo, con `online` o al encolar otro borrador.
    fetchFalso.mockResolvedValueOnce(json(200, { results: [] }));
    await syncAll();
    expect(enviadosEnLaLlamada(1)).toEqual([]);
  });

  it("un 403 del lote (aparato revocado) queda en error con el motivo del servidor, igual que en campo, y no se reenvía", async () => {
    const d = await queueDraft("inspection", inspeccion);
    fetchFalso.mockResolvedValue(json(403, { error: "device_revoked" }));
    expect(await syncAll()).toEqual({ synced: 0, errored: 1, stillPending: 0, sessionExpired: false });
    expect(await listDrafts()).toMatchObject([{ id: d.id, status: "error", errorMessage: "device_revoked" }]);

    await syncAll();
    expect(enviadosEnLaLlamada(1)).toEqual([]);
  });
});

describe("cola de fotos de la ronda (`syncTrapPhotos`): qué vuelve a subir tras un rechazo", () => {
  const encolarFoto = () =>
    queueTrapPhoto({
      locationId: "lugar-1",
      revisionClientDraftId: "revision-1",
      file: new File(["jpeg"], "trampa.jpg", { type: "image/jpeg" }),
    });
  const subidasDelBlob = () => fetchFalso.mock.calls.filter(([, init]) => init?.method === "PUT").length;

  beforeEach(() => {
    vi.mocked(requestTrampaPhotoUploadAction).mockResolvedValue({
      uploadUrl: "https://almacen.invalid/firmada",
      storageKey: "clave-1",
    });
    fetchFalso.mockResolvedValue(new Response(null, { status: 200 }));
  });

  it("control: «la revisión todavía no llegó» deja la foto pendiente y el intento siguiente la vuelve a subir", async () => {
    await encolarFoto();
    vi.mocked(finalizeTrampaPhotoPorBorradorAction).mockResolvedValue({ pendiente: true });
    await syncTrapPhotos();
    expect((await listTrapPhotoDrafts()).map((f) => f.status)).toEqual(["pending"]);

    await syncTrapPhotos();
    expect({ pedirUrl: vi.mocked(requestTrampaPhotoUploadAction).mock.calls.length, subidas: subidasDelBlob() }).toEqual(
      { pedirUrl: 2, subidas: 2 },
    );
  });

  it("una foto rechazada al finalizar queda en error y el intento siguiente no la vuelve a subir", async () => {
    await encolarFoto();
    vi.mocked(finalizeTrampaPhotoPorBorradorAction).mockResolvedValue({ error: "error_access" });
    expect(await syncTrapPhotos()).toMatchObject({ rejected: 1, stillPending: 0 });
    expect(await listTrapPhotoDrafts()).toMatchObject([{ status: "error", errorMessage: "error_access" }]);

    await syncTrapPhotos();
    expect({ pedirUrl: vi.mocked(requestTrampaPhotoUploadAction).mock.calls.length, subidas: subidasDelBlob() }).toEqual(
      { pedirUrl: 1, subidas: 1 },
    );
  });
});
