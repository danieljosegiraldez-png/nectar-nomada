/**
 * P4 §5 — pull por cursor.
 *
 * GET y no POST: es una lectura, y un GET deja que el cursor viaje en la URL,
 * que es lo que hace depurable una sincronización — se puede pegar en un
 * navegador y ver exactamente lo que el aparato recibió.
 *
 * El cuerpo de la respuesta trae el cursor a usar la próxima vez. El cliente no
 * lo calcula: si lo hiciera, dos implementaciones tendrían que coincidir sobre
 * cuál fue la última fila, y la que se equivoque se salta trabajo en silencio.
 *
 * Se autentica por la sesión de cookie existente, igual que el push. El carril
 * de tokens sigue aplazado (ADR-108).
 */
import { resolverPrincipal } from "../../../../../lib/sync/requestPrincipal";
import { pullFieldWork, LIMITE_POR_PAGINA, type PullCursor } from "../../../../../lib/sync/pullFieldWork";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // P4 §2 — cookie o token de aparato, indistinto para esta ruta.
  const user = await resolverPrincipal(request);
  if (!user) return Response.json({ error: "not_authenticated" }, { status: 401 });

  const q = new URL(request.url).searchParams;

  // Las dos mitades de un cursor van juntas o no van: una marca de tiempo sin
  // su id no desempata, y aceptarla a medias daría una paginación que se salta
  // filas sólo cuando dos comparten milisegundo — el fallo más difícil de ver.
  const media = (a: string | null, b: string | null) => (a === null) !== (b === null);
  const sessionUpdatedAt = q.get("sessionUpdatedAt");
  const sessionId = q.get("sessionId");
  const eventCreatedAt = q.get("eventCreatedAt");
  const eventId = q.get("eventId");
  if (media(sessionUpdatedAt, sessionId) || media(eventCreatedAt, eventId)) {
    return Response.json({ error: "cursor_incompleto" }, { status: 400 });
  }
  for (const marca of [sessionUpdatedAt, eventCreatedAt]) {
    if (marca !== null && Number.isNaN(new Date(marca).getTime())) {
      return Response.json({ error: "cursor_malformado" }, { status: 400 });
    }
  }

  const limiteCrudo = q.get("limit");
  let limite = LIMITE_POR_PAGINA;
  if (limiteCrudo !== null) {
    const n = Number(limiteCrudo);
    if (!Number.isInteger(n) || n < 1 || n > LIMITE_POR_PAGINA) {
      return Response.json({ error: "limit_fuera_de_rango" }, { status: 400 });
    }
    limite = n;
  }

  const cursor: PullCursor = { sessionUpdatedAt, sessionId, eventCreatedAt, eventId };
  const resultado = await pullFieldWork(user.userAccountId, cursor, limite);
  return Response.json(resultado, { status: 200 });
}
