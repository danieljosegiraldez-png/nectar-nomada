import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lo que las tres colas offline VUELVEN A RECOGER después de que el servidor dijo
 * que no — revisión de Codex del 2026-10-11, medida aquí por ejecución.
 *
 * **La afirmación.** Las tres marcan `error` un rechazo del servidor y, en el
 * intento siguiente, lo vuelven a mandar, porque sus filtros recogen
 * `pending || error` (`lib/sync/offlineQueue.ts:347`, `lib/apiary/offlineQueue.ts:203`,
 * `lib/sync/trapPhotoQueue.ts:143`). Sus propios comentarios dicen lo contrario:
 * «no se reintenta contra algo que no puede salir bien nunca»
 * (`lib/sync/offlineQueue.ts:334-337`, `:368-370`), «not silently retried forever»
 * (`lib/apiary/offlineQueue.ts:196-199`). No hay bucle dentro de una llamada ni se
 * borra nada: el defecto es que no hay condición terminal, y el intento siguiente
 * lo dispara la propia pantalla —`RondaDeTrampaForm` al registrar con señal,
 * `OfflineSyncIndicator` con `online` y al encolar, `SincronizarFotosDeRonda` con
 * cada sincronización de revisiones—.
 *
 * **Cada caso terminal tiene su control al lado**, un rechazo NO terminal (503,
 * sin señal, «la revisión todavía no llegó») que SÍ tiene que reenviarse. Sin él,
 * «no se reenvió» podría ser «la medición no ve ningún envío»: los controles
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
    expect(await syncFieldEvents()).toMatchObject({ serverUnavailable: true });
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

  it("un 403 del lote (aparato revocado) queda en error y el intento siguiente no lo reenvía", async () => {
    const d = await queueFieldEvent(evento);
    fetchFalso.mockResolvedValue(json(403, { error: "device_revoked" }));
    await syncFieldEvents();
    expect(await listFieldEventDrafts()).toMatchObject([{ id: d.id, status: "error", errorMessage: "HTTP 403" }]);

    await syncFieldEvents();
    expect(enviadosEnLaLlamada(1)).toEqual([]);
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
    expect(await syncAll()).toEqual({ synced: 0, errored: 0, stillPending: 1 });

    fetchFalso.mockResolvedValueOnce(json(200, { results: [{ clientDraftId: d.id, status: "applied" }] }));
    await syncAll();
    expect(enviadosEnLaLlamada(1)).toEqual([d.id]);
  });

  it("un borrador rechazado queda en error y el intento siguiente no lo reenvía", async () => {
    const d = await queueDraft("inspection", inspeccion);
    fetchFalso.mockResolvedValueOnce(
      json(200, { results: [{ clientDraftId: d.id, status: "rejected", reason: "colony_not_found" }] }),
    );
    expect(await syncAll()).toMatchObject({ errored: 1 });
    expect(await listDrafts()).toMatchObject([{ id: d.id, status: "error", errorMessage: "colony_not_found" }]);

    // `OfflineSyncIndicator` dispara este segundo intento solo, con `online` o al encolar otro borrador.
    fetchFalso.mockResolvedValueOnce(json(200, { results: [] }));
    await syncAll();
    expect(enviadosEnLaLlamada(1)).toEqual([]);
  });

  it("un 403 del lote deja algo que lo distinga de no tener señal, en lo que devuelve o en lo que guarda", async () => {
    const medir = async (respuesta: () => Promise<Response>) => {
      instalarIndexedDbEnMemoria();
      fetchFalso.mockReset();
      fetchFalso.mockImplementationOnce(respuesta);
      await queueDraft("inspection", inspeccion);
      const devuelve = await syncAll();
      const guarda = (await listDrafts()).map(({ status, errorMessage }) => ({ status, errorMessage }));
      return { llamadas: llamadasAlLote().length, devuelve, guarda };
    };
    const sinSenal = await medir(() => Promise.reject(new TypeError("Failed to fetch")));
    const revocado = await medir(() => Promise.resolve(json(403, { error: "device_revoked" })));

    // Las dos corridas llegaron al lote: si una no hubiera llamado, compararlas no diría nada.
    expect([sinSenal.llamadas, revocado.llamadas]).toEqual([1, 1]);
    expect({ devuelve: revocado.devuelve, guarda: revocado.guarda }).not.toEqual({
      devuelve: sinSenal.devuelve,
      guarda: sinSenal.guarda,
    });
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
    await syncTrapPhotos();
    expect(await listTrapPhotoDrafts()).toMatchObject([{ status: "error", errorMessage: "error_access" }]);

    await syncTrapPhotos();
    expect({ pedirUrl: vi.mocked(requestTrampaPhotoUploadAction).mock.calls.length, subidas: subidasDelBlob() }).toEqual(
      { pedirUrl: 1, subidas: 1 },
    );
  });
});
