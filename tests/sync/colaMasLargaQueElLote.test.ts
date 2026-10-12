import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Una cola de más de 200 borradores contra un servidor que no acepta más de 200
 * por petición — medido aquí por ejecución el 2026-10-11, tras verlo leyendo.
 *
 * **El defecto.** `app/api/v1/sync/field-events/route.ts` responde 413
 * `batch_too_large` a un lote de más de 200 mutaciones, y las dos colas
 * mandaban la cola ENTERA en una sola petición: `syncFieldEvents` en
 * `lib/sync/offlineQueue.ts` y `syncAll` en `lib/apiary/offlineQueue.ts`.
 * `clasificarRespuesta(413)` decía «rechazar», así que los 201 borradores —todos
 * buenos— quedaban en `error` con `batch_too_large`. Y desde
 * `tests/sync/rechazoTerminalEnLasColas.test.ts` un rechazado no vuelve a viajar
 * nunca: la pantalla sólo ofrecía descartarlo. Lo que el servidor dijo era
 * «demasiado grande para una petición», no «esto está mal».
 *
 * **Lo que decidió Daniel ese día, y fijan estas pruebas:** las colas trocean en
 * tandas de `TOPE_DEL_LOTE` (`lib/sync/topeDelLote.ts`, la misma constante que
 * usa la ruta), cada tanda con su propio veredicto, y un 413 que llegue igual
 * deja lo anotado pendiente (`tests/sync/clasificarRespuesta.test.ts`).
 *
 * **Medido antes de decidir, para que nadie lo reponga:** leer el 413 como
 * «reintentar» SIN trocear no saca nunca las 201 —cada intento manda las 201 y
 * vuelve otro 413—, la pantalla de campo dice «el servidor no respondió», y a los
 * 21 días la purga las borra igual. Con esa mutación, la prueba «ninguno queda
 * rechazado» pasa y «los 201 llegan» sigue cayendo: por eso son dos.
 *
 * **El servidor falso copia el tope A MANO** (200, de la línea del `413` en esa
 * ruta) en vez de importarlo: la ruta arrastra `next-auth`, que vitest no
 * resuelve, y una expectativa sacada del código bajo prueba pasaría con él roto.
 * Si el servidor cambia de tope, este número cambia con él.
 *
 * **El control va primero y es el de 200**: el mismo servidor, la misma
 * medición, y la cola sale entera en una petición. Sin él, «0 aplicados» con 201
 * podría ser un servidor falso que no aplica nada.
 *
 * Hermético: IndexedDB en memoria (`tests/helpers/indexedDbEnMemoria.ts`) y
 * `fetch` falso. Ni base ni red.
 */

import { listDrafts, queueDraft, syncAll } from "../../lib/apiary/offlineQueue";
import { listFieldEventDrafts, queueFieldEvent, syncFieldEvents } from "../../lib/sync/offlineQueue";
import { instalarIndexedDbEnMemoria } from "../helpers/indexedDbEnMemoria";

const RUTA_DE_LOTE = "/api/v1/sync/field-events";
const TOPE_DEL_SERVIDOR = 200;

const fetchFalso = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
let aplicadosPorElServidor = new Set<string>();
let tamanosDeLasPeticiones: number[] = [];

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
}

/** Lo que hace la ruta con un lote de mutaciones válidas: el tope, o un `applied` por cada una. */
function servidorConTope(url: string, init?: RequestInit): Promise<Response> {
  if (url !== RUTA_DE_LOTE) throw new Error(`servidor falso: ruta inesperada ${url}`);
  const { mutations } = JSON.parse(String(init?.body)) as { mutations: Array<{ clientDraftId: string }> };
  tamanosDeLasPeticiones.push(mutations.length);
  if (mutations.length > TOPE_DEL_SERVIDOR) return Promise.resolve(json(413, { error: "batch_too_large" }));
  for (const m of mutations) aplicadosPorElServidor.add(m.clientDraftId);
  return Promise.resolve(
    json(200, { results: mutations.map((m) => ({ clientDraftId: m.clientDraftId, status: "applied" })) }),
  );
}

const caido = () => Promise.resolve(json(503, { error: "unavailable" }));
const malFormado = () => Promise.resolve(json(400, { error: "mutation_malformed" }));

function estadosDe(borradores: Array<{ status: string }>): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const b of borradores) cuenta[b.status] = (cuenta[b.status] ?? 0) + 1;
  return cuenta;
}

function rechazadosDe(borradores: Array<{ status: string; errorMessage?: string }>) {
  const rechazados = borradores.filter((b) => b.status === "error");
  return { rechazados: rechazados.length, motivos: [...new Set(rechazados.map((b) => b.errorMessage))] };
}

beforeEach(() => {
  instalarIndexedDbEnMemoria();
  aplicadosPorElServidor = new Set();
  tamanosDeLasPeticiones = [];
  fetchFalso.mockReset();
  fetchFalso.mockImplementation(servidorConTope);
  vi.stubGlobal("fetch", fetchFalso);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k === "nn-field-device-id" ? "aparato-de-prueba" : null),
    setItem: () => {},
    removeItem: () => {},
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cola de campo (`syncFieldEvents`) con más borradores de los que caben en un lote", () => {
  const encolar = async (n: number) => {
    for (let i = 0; i < n; i++) await queueFieldEvent({ kind: "field_event", fieldSessionId: "sesion-1", note: `n${i}` });
  };

  it("control: 200 borradores salen en una sola petición y se aplican todos", async () => {
    await encolar(200);
    expect(await syncFieldEvents()).toMatchObject({ applied: 200, rejected: 0, stillPending: 0 });
    expect({ peticiones: tamanosDeLasPeticiones, aplicados: aplicadosPorElServidor.size }).toEqual({
      peticiones: [200],
      aplicados: 200,
    });
    expect(await listFieldEventDrafts()).toEqual([]);
  });

  it("con 201 borradores buenos, ninguno queda rechazado por el tamaño del lote", async () => {
    await encolar(201);
    await syncFieldEvents();
    expect(rechazadosDe(await listFieldEventDrafts())).toEqual({ rechazados: 0, motivos: [] });
  });

  it("con 201 borradores buenos, los 201 llegan al servidor sin pasar el tope en ninguna petición", async () => {
    await encolar(201);
    const resumen = await syncFieldEvents();
    expect({
      aplicados: aplicadosPorElServidor.size,
      enCola: (await listFieldEventDrafts()).length,
      todasCabenEnElTope: tamanosDeLasPeticiones.every((t) => t <= TOPE_DEL_SERVIDOR),
      resumen: { applied: resumen.applied, rejected: resumen.rejected, stillPending: resumen.stillPending },
    }).toEqual({
      aplicados: 201,
      enCola: 0,
      todasCabenEnElTope: true,
      resumen: { applied: 201, rejected: 0, stillPending: 0 },
    });
  });

  it("si la segunda tanda no puede entrar (503), la primera queda aplicada y lo que falta sigue pendiente", async () => {
    await encolar(201);
    fetchFalso.mockImplementationOnce(servidorConTope).mockImplementationOnce(caido);
    const resumen = await syncFieldEvents();
    expect({
      aplicados: aplicadosPorElServidor.size,
      estados: estadosDe(await listFieldEventDrafts()),
      resumen: { applied: resumen.applied, stillPending: resumen.stillPending, serverUnavailable: resumen.serverUnavailable },
    }).toEqual({
      aplicados: 200,
      estados: { pending: 1 },
      resumen: { applied: 200, stillPending: 1, serverUnavailable: true },
    });
  });

  it("si el servidor niega una tanda entera (400), sólo esa queda rechazada y la siguiente sale igual", async () => {
    await encolar(201);
    fetchFalso.mockImplementationOnce(malFormado);
    const resumen = await syncFieldEvents();
    expect({
      aplicados: aplicadosPorElServidor.size,
      estados: estadosDe(await listFieldEventDrafts()),
      resumen: { applied: resumen.applied, rejected: resumen.rejected, stillPending: resumen.stillPending },
    }).toEqual({
      aplicados: 1,
      estados: { error: 200 },
      resumen: { applied: 1, rejected: 200, stillPending: 0 },
    });
  });
});

describe("cola de apiario (`syncAll`) con más borradores de los que caben en un lote", () => {
  const encolar = async (n: number) => {
    for (let i = 0; i < n; i++) await queueDraft("inspection", { colonyId: "colonia-1", note: `n${i}` });
  };

  it("control: 200 borradores salen en una sola petición y se aplican todos", async () => {
    await encolar(200);
    expect(await syncAll()).toEqual({ synced: 200, errored: 0, stillPending: 0, sessionExpired: false });
    expect({ peticiones: tamanosDeLasPeticiones, aplicados: aplicadosPorElServidor.size }).toEqual({
      peticiones: [200],
      aplicados: 200,
    });
    expect(await listDrafts()).toEqual([]);
  });

  it("con 201 borradores buenos, ninguno queda rechazado por el tamaño del lote", async () => {
    await encolar(201);
    await syncAll();
    expect(rechazadosDe(await listDrafts())).toEqual({ rechazados: 0, motivos: [] });
  });

  it("con 201 borradores buenos, los 201 llegan al servidor sin pasar el tope en ninguna petición", async () => {
    await encolar(201);
    const resumen = await syncAll();
    expect({
      aplicados: aplicadosPorElServidor.size,
      enCola: (await listDrafts()).length,
      todasCabenEnElTope: tamanosDeLasPeticiones.every((t) => t <= TOPE_DEL_SERVIDOR),
      resumen,
    }).toEqual({
      aplicados: 201,
      enCola: 0,
      todasCabenEnElTope: true,
      resumen: { synced: 201, errored: 0, stillPending: 0, sessionExpired: false },
    });
  });

  it("si la segunda tanda no puede entrar (503), la primera queda aplicada y lo que falta sigue pendiente", async () => {
    await encolar(201);
    fetchFalso.mockImplementationOnce(servidorConTope).mockImplementationOnce(caido);
    const resumen = await syncAll();
    expect({
      aplicados: aplicadosPorElServidor.size,
      estados: estadosDe(await listDrafts()),
      resumen,
    }).toEqual({
      aplicados: 200,
      estados: { pending: 1 },
      resumen: { synced: 200, errored: 0, stillPending: 1, sessionExpired: false },
    });
  });

  it("si el servidor niega una tanda entera (400), sólo esa queda rechazada y la siguiente sale igual", async () => {
    await encolar(201);
    fetchFalso.mockImplementationOnce(malFormado);
    const resumen = await syncAll();
    expect({
      aplicados: aplicadosPorElServidor.size,
      estados: estadosDe(await listDrafts()),
      resumen,
    }).toEqual({
      aplicados: 1,
      estados: { error: 200 },
      resumen: { synced: 1, errored: 200, stillPending: 0, sessionExpired: false },
    });
  });
});
