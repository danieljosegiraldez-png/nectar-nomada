import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "../db";
import { resolvedPermissionKeys, can } from "../rbac/service";

/**
 * P4 §8 — la instantánea de autorización que un aparato lleva encima.
 *
 * **Qué añade sobre el pull de §5, que ya devuelve las Locations.** Dos cosas,
 * y sólo por la segunda existe este archivo:
 *
 * 1. **Qué puede HACER el operador en cada sitio**, no sólo dónde. El pull dice
 *    «estos son tus lotes»; esto dice «en éste puedes registrar, en éste sólo
 *    mirar». La interfaz deja de ofrecer botones que el servidor va a negar.
 * 2. **Una caducidad.** La lista de Locations del pull no tiene ninguna: un
 *    aparato perdido podría seguir preparando trabajo para siempre contra un
 *    ámbito que ya no tiene. Con techo, deja de poder **preparar** al llegar la
 *    fecha aunque no vuelva a conectarse nunca. Ésa es la propiedad de
 *    seguridad que §8 pide, y no se puede obtener del pull.
 *
 * **Decide qué OFRECER, nunca qué se guarda.** El servidor re-comprueba cada
 * mutación al sincronizar —`recordFieldEvent`, `pushFieldEvents` y
 * `finalizeFieldMedia` llaman todos a `requireLocationAttributeAccess`— así que
 * una instantánea caducada, editada o robada **no concede autoridad ninguna**.
 * Es la misma frontera que `resolvedPermissionKeys` ya declara en su propio
 * comentario: «for building UI affordances, not for enforcement».
 *
 * **Por qué se firma, entonces.** No para que el aparato confíe en ella —el
 * aparato la tiene y podría reescribirla— sino para que el **servidor** pueda
 * reconocer la suya sin ir a la base: cuando exista el carril de tokens (§2),
 * un cliente presentará esta instantánea y el servidor comprobará firma y fecha
 * sin una consulta. Hoy se firma para que ese día no haya que cambiar el
 * formato ni reemitir nada.
 */

/** El techo que nombra el audit §19. Un aparato perdido deja de preparar aquí. */
export const VIGENCIA_DIAS = 14;

export interface AuthorizationSnapshot {
  userAccountId: string;
  issuedAt: string;
  expiresAt: string;
  /** Una entrada por Location visible, con lo que el operador puede hacer ahí. */
  scopes: { locationId: string; permissions: string[] }[];
}

export interface SignedSnapshot {
  snapshot: AuthorizationSnapshot;
  signature: string;
}

export class SnapshotError extends Error {}

/**
 * Clave derivada de `AUTH_SECRET` y atada a este propósito.
 *
 * No se usa `AUTH_SECRET` en crudo: la misma clave firmando dos cosas distintas
 * deja que un artefacto de un sistema se presente como del otro. Derivarla por
 * propósito es separación de claves estándar y no cuesta configuración nueva —
 * y una variable de entorno nueva habría que ponerla en Vercel, que es una
 * decisión del dueño y bloquearía el despliegue.
 */
function claveDeFirma(): Buffer {
  const base = process.env.AUTH_SECRET;
  if (!base) throw new SnapshotError("auth_secret_ausente");
  return createHmac("sha256", base).update("p4:authorization-snapshot:v1").digest();
}

function firmar(snapshot: AuthorizationSnapshot): string {
  // Se firma el JSON canónico: las claves en el orden en que se construyen y
  // sin espacios. Si alguien reordena el objeto al serializar, la firma deja de
  // cuadrar — por eso la serialización vive aquí y no en el llamador.
  return createHmac("sha256", claveDeFirma()).update(JSON.stringify(snapshot)).digest("base64url");
}

export async function issueAuthorizationSnapshot(
  userAccountId: string,
  ahora: Date = new Date(),
): Promise<SignedSnapshot> {
  const locations = await prisma.location.findMany({
    select: { id: true, classification: true },
    orderBy: { id: "asc" },
  });

  const scopes: AuthorizationSnapshot["scopes"] = [];
  for (const l of locations) {
    // Mismo N+1 consciente que el pull de §5, y por la misma razón: reutilizar
    // el camino real de RBAC en vez de una segunda copia que puede derivar.
    if (!(await can(userAccountId, "manage_attributes", "location",
                    { scopeType: "location", scopeRefId: l.id }, l.classification))) {
      continue;
    }
    const claves = await resolvedPermissionKeys(userAccountId, { scopeType: "location", scopeRefId: l.id });
    scopes.push({ locationId: l.id, permissions: [...claves].sort() });
  }

  const snapshot: AuthorizationSnapshot = {
    userAccountId,
    issuedAt: ahora.toISOString(),
    expiresAt: new Date(ahora.getTime() + VIGENCIA_DIAS * 24 * 60 * 60 * 1000).toISOString(),
    scopes,
  };
  return { snapshot, signature: firmar(snapshot) };
}

/**
 * Comprueba firma y vigencia. **No consulta la base**: ése es el punto — el día
 * que un cliente nativo presente su instantánea, el servidor podrá reconocerla
 * sin round-trip.
 *
 * Comparación en tiempo constante: comparar firmas con `===` filtra por dónde
 * empiezan a diferir, y aunque aquí el atacante ya tiene el aparato, escribir
 * la comparación floja una vez es cómo acaba copiada donde sí importa.
 */
export function verifyAuthorizationSnapshot(
  firmado: SignedSnapshot,
  ahora: Date = new Date(),
): AuthorizationSnapshot {
  const esperada = Buffer.from(firmar(firmado.snapshot), "utf8");
  const recibida = Buffer.from(firmado.signature ?? "", "utf8");
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
    throw new SnapshotError("firma_invalida");
  }
  if (new Date(firmado.snapshot.expiresAt).getTime() <= ahora.getTime()) {
    throw new SnapshotError("instantanea_caducada");
  }
  return firmado.snapshot;
}

/**
 * Lo que la interfaz pregunta: ¿ofrezco este botón?
 *
 * Deliberadamente NO se llama `can` ni nada parecido: quien lea el nombre tiene
 * que ver que esto no autoriza. La autorización es siempre `can()` en el
 * servidor (SECURITY.md §2).
 */
export function ofreceEnLocation(
  snapshot: AuthorizationSnapshot,
  locationId: string,
  permiso: string,
): boolean {
  return snapshot.scopes.find((s) => s.locationId === locationId)?.permissions.includes(permiso) ?? false;
}
