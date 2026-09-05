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
 */
import { resolverPrincipal } from "../../../../../lib/sync/requestPrincipal";
import { pushFieldEvents, DeviceError, type PushMutation } from "../../../../../lib/sync/pushFieldEvents";

export const dynamic = "force-dynamic";

/** Las fechas viajan como texto ISO por JSON y vuelven a ser fechas aquí. */
function toDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

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

  const parsed: PushMutation[] = [];
  for (const raw of mutations) {
    const m = (raw ?? {}) as Record<string, unknown>;
    const occurredAt = toDate(m.occurredAt);
    if (typeof m.clientDraftId !== "string" || typeof m.fieldSessionId !== "string") {
      return Response.json({ error: "mutation_missing_ids" }, { status: 400 });
    }
    if (typeof m.eventKindValueId !== "string" || !occurredAt) {
      return Response.json({ error: "mutation_malformed" }, { status: 400 });
    }
    parsed.push({
      clientDraftId: m.clientDraftId,
      fieldSessionId: m.fieldSessionId,
      eventKindValueId: m.eventKindValueId,
      occurredAt,
      recordedAt: toDate(m.recordedAt),
      position: (m.position ?? undefined) as PushMutation["position"],
      operatorPersonId: typeof m.operatorPersonId === "string" ? m.operatorPersonId : null,
      notes: typeof m.notes === "string" ? m.notes : null,
    });
  }

  try {
    const results = await pushFieldEvents(user.userAccountId, deviceId, parsed);
    return Response.json({ results }, { status: 200 });
  } catch (error) {
    if (error instanceof DeviceError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    // Cualquier otra cosa sube: el cliente verá un 500 y dejará la cola
    // intacta, que es el comportamiento correcto ante «no sé si llegó».
    throw error;
  }
}
