/**
 * P4 §1 — registro de dispositivo.
 *
 * Ruta HTTP y no Server Action a propósito: el cliente que la va a llamar de
 * verdad es el Android de la Fase 5, y una Server Action sólo la puede invocar
 * un cliente React de este mismo despliegue. Que la PWA la ejerza ahora es
 * precisamente lo que §26 del audit pide — un cliente real contra un protocolo
 * real, sin la incertidumbre del nativo encima.
 *
 * Se autentica por la cookie de sesión o por el token de un aparato ya
 * registrado (`resolverPrincipal`, P4 §2). Este párrafo decía que el carril de
 * tokens no estaba construido; dejó de ser cierto cuando la ruta pasó a
 * `resolverPrincipal`.
 *
 * Toda la validación vive en `lib/sync/devices.ts`: aquí sólo se traduce HTTP.
 */
import { resolverPrincipal } from "../../../../lib/sync/requestPrincipal";
import { negativaDelAparato } from "../../../../lib/sync/deviceTokens";
import { registerDevice, DeviceValidationError } from "../../../../lib/sync/devices";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // P4 §2 — cookie o token de aparato, indistinto para esta ruta.
  const user = await resolverPrincipal(request);
  if (!user) return Response.json({ error: "not_authenticated" }, { status: 401 });
  // Un aparato revocado no da de alta otro con el access que aún le queda.
  const negativa = await negativaDelAparato(user.deviceId);
  if (negativa) return Response.json({ error: negativa }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const { label, platform, operatorPersonId } = (body ?? {}) as Record<string, unknown>;
  if (typeof label !== "string" || typeof platform !== "string") {
    return Response.json({ error: "label_and_platform_required" }, { status: 400 });
  }
  if (operatorPersonId != null && typeof operatorPersonId !== "string") {
    return Response.json({ error: "operator_person_id_invalid" }, { status: 400 });
  }

  try {
    const device = await registerDevice(user.userAccountId, { label, platform, operatorPersonId });
    return Response.json(device, { status: 201 });
  } catch (error) {
    if (error instanceof DeviceValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
