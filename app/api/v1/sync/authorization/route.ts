/**
 * P4 §8 — la instantánea de autorización.
 *
 * `GET`: devuelve la instantánea firmada del operador de la sesión. El aparato
 * la guarda y la usa para decidir **qué ofrecer**, nunca qué se guarda: cada
 * mutación se re-comprueba en el servidor al sincronizar.
 *
 * Se emite fresca en cada llamada en vez de cachearse: es barata, y una
 * instantánea servida de caché podría seguir ofreciendo un ámbito que acaban de
 * revocar. La caducidad es el techo para un aparato sin señal, no una excusa
 * para no releer cuando sí la hay.
 */
import { resolverPrincipal } from "../../../../../lib/sync/requestPrincipal";
import { issueAuthorizationSnapshot, SnapshotError } from "../../../../../lib/sync/authorizationSnapshot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // P4 §2 — cookie o token de aparato, indistinto para esta ruta.
  const user = await resolverPrincipal(request);
  if (!user) return Response.json({ error: "not_authenticated" }, { status: 401 });

  try {
    return Response.json(await issueAuthorizationSnapshot(user.userAccountId), { status: 200 });
  } catch (error) {
    if (error instanceof SnapshotError) {
      // Falta `AUTH_SECRET`: es un fallo de despliegue, no del cliente. 503 y
      // no 500 porque es transitorio por definición — alguien tiene que poner
      // la variable— y el cliente debe reintentar, no marcar error.
      return Response.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
}
