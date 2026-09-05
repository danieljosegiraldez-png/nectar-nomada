/**
 * P4 §2 — alta de aparato con credenciales. La ÚNICA vez que una contraseña
 * entra por este carril; a partir de aquí el aparato vive de sus tokens, que es
 * lo que permite no volver a teclearla en un cafetal.
 *
 * Responde 401 para cualquier fallo de credenciales, con el mismo cuerpo: el
 * servicio ya se encarga de no distinguir correo desconocido de contraseña
 * mala, y la ruta no lo deshace.
 */
import { registrarAparato, DeviceAuthError } from "../../../../../lib/sync/deviceTokens";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const { email, password, label, platform, operatorPersonId } = body;
  if (typeof email !== "string" || typeof password !== "string" ||
      typeof label !== "string" || typeof platform !== "string") {
    return Response.json({ error: "campos_requeridos" }, { status: 400 });
  }
  try {
    const r = await registrarAparato({
      email, password, label, platform,
      operatorPersonId: typeof operatorPersonId === "string" ? operatorPersonId : null,
    });
    return Response.json(r, { status: 201 });
  } catch (error) {
    if (error instanceof DeviceAuthError) {
      const estado = error.message === "auth_secret_ausente" ? 503 : 401;
      return Response.json({ error: error.message }, { status: estado });
    }
    throw error;
  }
}
