import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "../db";
import { verifyPassword } from "../auth/password";

/**
 * P4 §2 — el carril de tokens del aparato.
 *
 * **Por qué ahora.** ADR-108 lo aplazó «hasta que exista un cliente nativo que
 * lo llame», y la Fase 5 es ese día: un cliente nativo **no puede** usar la
 * cookie de sesión de la PWA. Este módulo es el prerrequisito de toda la fase,
 * no parte de ella.
 *
 * **Dos credenciales con vidas distintas, que es la forma entera:**
 *
 * - El **refresh** es largo, se emite una vez al registrar el aparato y sólo
 *   sirve para pedir accesos. Se guarda **hasheado**: quien lea la base no
 *   puede suplantar a un aparato.
 * - El **access** es corto (una hora), va firmado y **no se guarda en ninguna
 *   parte** — se verifica por firma, que es lo que permite atender a un aparato
 *   sin consultar la base en cada petición.
 *
 * **Revocación.** `Device.revokedAt` corta el refresco al instante. Un access ya
 * emitido sigue siendo criptográficamente válido hasta que expira —eso es
 * inherente a un token sin estado— pero **no sirve para escribir**:
 * `pushFieldEvents` comprueba `revokedAt` en cada lote, así que un aparato
 * revocado no mete una fila ni dentro de esa hora. La ventana es de lectura, y
 * es la que el audit §19 acepta a cambio de no consultar la base por petición.
 *
 * **Sin rotación de refresh en esta versión.** Rotar es una mitigación real
 * contra el robo del token, pero obliga a resolver la carrera de dos refrescos
 * simultáneos — y un aparato de campo con cobertura intermitente los produce.
 * Se anota como pendiente en vez de hacerse a medias.
 */

export const ACCESS_TTL_SEGUNDOS = 60 * 60;

export class DeviceAuthError extends Error {}

function claveDe(proposito: string): Buffer {
  const base = process.env.AUTH_SECRET;
  if (!base) throw new DeviceAuthError("auth_secret_ausente");
  return createHmac("sha256", base).update(proposito).digest();
}

/** El refresh se guarda hasheado; SHA-256 basta porque son 32 bytes aleatorios. */
const hashDeRefresh = (token: string) => createHash("sha256").update(token).digest("hex");

interface AccessPayload {
  deviceId: string;
  userAccountId: string;
  exp: number;
}

function firmarAccess(payload: AccessPayload): string {
  const cuerpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const firma = createHmac("sha256", claveDe("p4:device-access:v1")).update(cuerpo).digest("base64url");
  return `${cuerpo}.${firma}`;
}

/**
 * Verifica un access token **sin tocar la base**. Ése es el punto: un aparato
 * puede sincronizar sin que cada petición cueste una consulta.
 */
export function verificarAccess(token: string, ahora: Date = new Date()): AccessPayload {
  const partes = token.split(".");
  if (partes.length !== 2) throw new DeviceAuthError("access_malformado");
  const [cuerpo, firma] = partes as [string, string];

  const esperada = Buffer.from(
    createHmac("sha256", claveDe("p4:device-access:v1")).update(cuerpo).digest("base64url"), "utf8");
  const recibida = Buffer.from(firma, "utf8");
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
    throw new DeviceAuthError("access_firma_invalida");
  }

  let payload: AccessPayload;
  try {
    payload = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as AccessPayload;
  } catch {
    throw new DeviceAuthError("access_malformado");
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= ahora.getTime()) {
    throw new DeviceAuthError("access_caducado");
  }
  return payload;
}

export interface RegistroDeAparato {
  email: string;
  password: string;
  label: string;
  platform: string;
  operatorPersonId?: string | null;
}

/**
 * Alta del aparato: la ÚNICA vez que una contraseña entra por este carril.
 *
 * A partir de aquí el aparato vive de sus tokens, que es lo que permite que la
 * contraseña no tenga que volver a teclearse en un cafetal.
 */
export async function registrarAparato(input: RegistroDeAparato) {
  const email = input.email.trim().toLowerCase();
  const persona = await prisma.person.findFirst({
    where: { email },
    select: { id: true, userAccount: { select: { id: true, passwordHash: true, status: true } } },
  });
  const cuenta = persona?.userAccount;

  // Mismo error para «no existe» y «contraseña mala», a propósito: distinguirlos
  // convierte este endpoint en un oráculo de qué correos tienen cuenta.
  if (!cuenta?.passwordHash || !(await verifyPassword(cuenta.passwordHash, input.password))) {
    throw new DeviceAuthError("credenciales_invalidas");
  }
  if (cuenta.status !== "active") throw new DeviceAuthError("cuenta_no_activa");
  if (input.platform !== "android" && input.platform !== "pwa") {
    throw new DeviceAuthError("platform_unsupported");
  }
  const label = input.label.trim();
  if (!label) throw new DeviceAuthError("label_required");

  const refresh = randomBytes(32).toString("base64url");
  const device = await prisma.device.create({
    data: {
      label: label.slice(0, 120),
      platform: input.platform,
      // ADR-109: los aparatos son personales. Por defecto, el operador es la
      // Persona de la cuenta que lo registra — no hay a quién más asignárselo.
      operatorPersonId: input.operatorPersonId ?? persona!.id,
      createdBy: cuenta.id,
      refreshTokenHash: hashDeRefresh(refresh),
      refreshTokenIssuedAt: new Date(),
    },
    select: { id: true, label: true, platform: true },
  });

  return { device, refreshToken: refresh, ...(await emitirAccess(device.id, cuenta.id)) };
}

async function emitirAccess(deviceId: string, userAccountId: string) {
  const exp = Math.floor(Date.now() / 1000) + ACCESS_TTL_SEGUNDOS;
  return { accessToken: firmarAccess({ deviceId, userAccountId, exp }), expiresAt: new Date(exp * 1000) };
}

/**
 * Canjea un refresh por un access. Aquí sí se consulta la base — es la única
 * petición del carril que lo hace, y por eso es donde la revocación muerde.
 */
export async function refrescarAcceso(refreshToken: string) {
  const device = await prisma.device.findUnique({
    where: { refreshTokenHash: hashDeRefresh(refreshToken) },
    select: { id: true, revokedAt: true, createdBy: true },
  });
  if (!device) throw new DeviceAuthError("refresh_desconocido");
  if (device.revokedAt) throw new DeviceAuthError("device_revoked");
  if (!device.createdBy) throw new DeviceAuthError("device_sin_cuenta");

  await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  return emitirAccess(device.id, device.createdBy);
}


export interface PrincipalDeAparato {
  userAccountId: string;
  deviceId: string;
}

/**
 * Interpreta la cabecera `Authorization`, **sin tocar Auth.js ni la base**.
 *
 * Se separa de `resolverPrincipal` porque aquélla importa el carril de la
 * cookie, que arrastra `next-auth`, que no carga fuera de una petición de Next
 * — y entonces la decisión que sí se puede equivocar quedaría sin probar. Es el
 * mismo movimiento que `clasificarRespuesta` y `construirEventoEncolado`.
 *
 * `hayBearer` se devuelve aparte del principal a propósito: un Bearer presente
 * y malo NO es lo mismo que no haber mandado ninguno. El primero es un no; el
 * segundo deja pasar a la cookie.
 */
export function interpretarAutorizacion(
  cabecera: string | null,
  ahora: Date = new Date(),
): { hayBearer: boolean; principal: PrincipalDeAparato | null } {
  if (!cabecera?.startsWith("Bearer ")) return { hayBearer: false, principal: null };
  try {
    const p = verificarAccess(cabecera.slice("Bearer ".length).trim(), ahora);
    return { hayBearer: true, principal: { userAccountId: p.userAccountId, deviceId: p.deviceId } };
  } catch (error) {
    if (error instanceof DeviceAuthError) return { hayBearer: true, principal: null };
    throw error;
  }
}
