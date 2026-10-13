/**
 * P4 §4 — push por lotes de eventos de campo, con resultado por mutación.
 *
 * El cuerpo es `{ deviceId, mutations: [...] }` y la respuesta
 * `{ results: [{ clientDraftId, status, ... }] }`, **un resultado por
 * mutación**. **200 aunque haya rechazos**: un rechazo es una respuesta del
 * protocolo, no un fallo de la petición, y devolver 4xx haría que el cliente lo
 * confundiera con «no llegué» y lo reintentara para siempre.
 *
 * **El orden NO es el de entrada, y decirlo importa.** Este comentario afirmaba
 * «y en el mismo orden», y dejó de ser cierto cuando los rechazos del parseo
 * pasaron a concatenarse al final (tarea 4): en un lote mixto, el rechazo de
 * una mutación aparece después de los resultados de las que sí se aplicaron.
 * La decisión de no reordenar está tomada y se mantiene —el cliente empareja
 * por `clientDraftId` (`drafts.find(d => d.id === r.clientDraftId)` en
 * `lib/sync/offlineQueue.ts`), nunca por posición, así que la corrección no
 * depende del orden— y lo que se corrige es la afirmación, que era falsa. Lo
 * que se degrada con el orden es la legibilidad de un informe de lote mixto,
 * no el resultado.
 *
 * Lo que sí es 4xx: el lote entero negado (aparato desconocido o revocado, o,
 * por token, un `deviceId` que no es el del token) y el cuerpo mal formado.
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
  // Por token, el aparato lo dice el token y no el cuerpo. Sin esto, el access
  // todavía vigente de un aparato revocado escribía nombrando en el cuerpo a
  // otro vivo, y `pushFieldEvents` comprobaba `revokedAt` sobre ése. Por cookie
  // (`deviceId === null`) no hay aparato propio y vale el del cuerpo, como antes.
  if (user.deviceId !== null && deviceId !== user.deviceId) {
    return Response.json({ error: "device_mismatch" }, { status: 403 });
  }
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
