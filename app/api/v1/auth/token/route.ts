/**
 * P4 §2 — canje de refresh por access.
 *
 * Es la única petición del carril que consulta la base, y por eso es donde la
 * revocación muerde: un aparato revocado deja de poder renovar en el acto.
 */
import { refrescarAcceso, DeviceAuthError } from "../../../../../lib/sync/deviceTokens";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.refreshToken !== "string") {
    return Response.json({ error: "refresh_token_requerido" }, { status: 400 });
  }
  try {
    return Response.json(await refrescarAcceso(body.refreshToken), { status: 200 });
  } catch (error) {
    if (error instanceof DeviceAuthError) {
      const estado = error.message === "auth_secret_ausente" ? 503 : 401;
      return Response.json({ error: error.message }, { status: estado });
    }
    throw error;
  }
}
