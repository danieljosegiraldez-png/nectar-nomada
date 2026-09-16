/**
 * P4 §4 — push por lotes de eventos de campo, con resultado por mutación.
 *
 * El cuerpo es `{ deviceId, mutations: [...] }` y la respuesta
 * `{ results: [{ clientDraftId, status, ... }] }`, un resultado por mutación y
 * en el mismo orden. **200 aunque haya rechazos**: un rechazo es una respuesta
 * del protocolo, no un fallo de la petición, y devolver 4xx haría que el
 * cliente lo confundiera con «no llegué» y lo reintentara para siempre.
 *
 * Lo que sí es 4xx: el lote entero negado (aparato desconocido o revocado) y el
 * cuerpo mal formado.
 *
 * **El parseo vive en `lib/sync/parsearMutaciones.ts`, no aquí.** Importar esta
 * ruta arrastra `next-auth`, que vitest no resuelve, así que mientras el parseo
 * estuvo dentro no tuvo ni una prueba — y se quedó sin la rama de `colony_end`
 * toda la A9.5, bloqueando la cola del apiario de quien anotara una pérdida sin
 * señal. Ese módulo lo explica y `tests/sync/parseoDelLote.test.ts` lo vigila.
 */
import { resolverPrincipal } from "../../../../../lib/sync/requestPrincipal";
import { pushFieldEvents, DeviceError } from "../../../../../lib/sync/pushFieldEvents";
import { parsearMutaciones } from "../../../../../lib/sync/parsearMutaciones";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // P4 §2 — cookie o token de aparato, indistinto para esta ruta.
  const user = await resolverPrincipal(request);
  if (!user) return Response.json({ error: "not_authenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const { deviceId, mutations } = (body ?? {}) as Record<string, unknown>;
  if (typeof deviceId !== "string") return Response.json({ error: "device_id_required" }, { status: 400 });
  if (!Array.isArray(mutations)) return Response.json({ error: "mutations_required" }, { status: 400 });
  // Un tope explícito: sin él, un cliente con un mes de cola manda una petición
  // que tarda más que cualquier tiempo de espera y no sincroniza nunca nada.
  // 200 es holgado para una jornada de campo y acotado para el servidor.
  if (mutations.length > 200) return Response.json({ error: "batch_too_large" }, { status: 413 });

  const parseo = parsearMutaciones(mutations);
  if (!parseo.ok) return Response.json({ error: parseo.error }, { status: 400 });

  try {
    const results = await pushFieldEvents(user.userAccountId, deviceId, parseo.mutations);
    const conRechazos = [
      ...results,
      ...parseo.rechazos.map((r) => ({ clientDraftId: r.clientDraftId, status: "rejected" as const, reason: r.reason })),
    ];
    return Response.json({ results: conRechazos }, { status: 200 });
  } catch (error) {
    if (error instanceof DeviceError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    // Cualquier otra cosa sube: el cliente verá un 500 y dejará la cola
    // intacta, que es el comportamiento correcto ante «no sé si llegó».
    throw error;
  }
}
