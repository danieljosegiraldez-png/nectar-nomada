/**
 * ADR-199 — cada borrador offline tiene dueño, y nunca se envía a nombre de otra cuenta.
 *
 * Funciones puras, compartidas por el navegador (las tres colas) y el servidor (el lote y las fotos).
 * Ni IndexedDB ni base de datos: por eso se pueden probar en Node, igual que `clasificarRespuesta` o
 * `classifyDraftAge`. Las colas delegan aquí todo lo que se puede equivocar en silencio.
 *
 * El dueño es la HUELLA de la cuenta (`lib/auth/huellaDeCuenta.ts`), nunca su id.
 */

/**
 * El motivo con que el servidor retiene un borrador de otra cuenta.
 *
 * **Es un «rechazado» a propósito, no un estado nuevo.** El JavaScript viejo que siga en la caché de
 * un teléfono trata cualquier estado que no conoce como éxito y DESCARTA el borrador; con `rejected`
 * lo marca como error, y se ve. El cliente nuevo reconoce este motivo y lo deja pendiente.
 */
export const RAZON_BORRADOR_AJENO = "borrador_de_otra_cuenta";

/** La mutación trae una cuenta que no es una cadena no vacía. Se rechaza sólo esa mutación. */
export const RAZON_CUENTA_INVALIDA = "cuenta_del_borrador_invalida";

/**
 * De quién es un borrador, visto desde el servidor.
 *
 * - Con cuenta, es propio sólo si coincide con la huella de quien envía.
 * - Sin cuenta (guardado antes de ADR-199, o anotado sin sesión), es de quien registró el aparato
 *   (`Device.createdBy`): decisión de Daniel del 2026-10-09. Un aparato sin creador no es de nadie,
 *   así que el borrador es ajeno para todos.
 */
export function duenoDelBorrador(e: {
  cuentaDelBorrador: string | null | undefined;
  huellaDeQuienEnvia: string;
  quienEnvia: string;
  creadorDelAparato: string | null;
}): "propio" | "ajeno" {
  if (e.cuentaDelBorrador != null) return e.cuentaDelBorrador === e.huellaDeQuienEnvia ? "propio" : "ajeno";
  return e.creadorDelAparato !== null && e.creadorDelAparato === e.quienEnvia ? "propio" : "ajeno";
}

/**
 * La cuenta que trae una mutación, tal como llega del JSON.
 *
 * Ausente o `null` es «sin cuenta». Lo demás que no sea una cadena no vacía no se puede comparar con
 * nada, y se dice en vez de tratarlo como «sin cuenta»: eso lo mandaría por la regla del aparato, que
 * es otra pregunta.
 */
export function cuentaDelBorradorDe(v: unknown): { ok: true; cuenta: string | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, cuenta: null };
  if (typeof v === "string" && v !== "") return { ok: true, cuenta: v };
  return { ok: false };
}

/** Lo mínimo que tienen en común los borradores de las tres colas. */
export interface ConCuenta {
  cuenta?: string | null;
}

/**
 * ADR-199 — el payload que se guarda, con la cuenta dentro además de en el borrador.
 *
 * El JavaScript de antes del cambio reconstruye la mutación sólo desde el payload; si la cuenta viviera sólo en
 * el borrador, una pestaña vieja la enviaría sin cuenta y el servidor aplicaría la regla del aparato. Los
 * constructores nuevos ponen la del borrador DESPUÉS del payload, así que ésta nunca manda sobre aquélla.
 */
export function payloadConCuenta<T>(payload: T, cuenta: string | null): T & { cuentaDelBorrador: string | null } {
  return { ...(payload as object), cuentaDelBorrador: cuenta } as T & { cuentaDelBorrador: string | null };
}

/**
 * Qué borradores puede enviar este navegador ahora.
 *
 * Los de la cuenta actual, y los que no tienen cuenta: ésos los decide el servidor por el aparato. Los
 * de otra cuenta no salen del teléfono. Sin cuenta actual —nadie ha entrado, o se cerró sesión—, todo
 * lo que tiene dueño es ajeno.
 */
export function repartirPorCuenta<T extends ConCuenta>(
  borradores: readonly T[],
  cuentaActual: string | null,
): { enviables: T[]; ajenos: T[] } {
  const enviables: T[] = [];
  const ajenos: T[] = [];
  for (const b of borradores) {
    if (b.cuenta == null || (cuentaActual !== null && b.cuenta === cuentaActual)) enviables.push(b);
    else ajenos.push(b);
  }
  return { enviables, ajenos };
}

/** Lo que el servidor contestó para UN borrador, en la forma que comparten el lote y las fotos. */
export interface RespuestaDeUnBorrador {
  status: string;
  reason?: string;
  /** Sólo en la retención de un borrador sin cuenta: la huella de quien registró el aparato. */
  cuentaDelBorrador?: string;
}

export function esRetencion(r: RespuestaDeUnBorrador): boolean {
  return r.status === "rejected" && r.reason === RAZON_BORRADOR_AJENO;
}

/**
 * La cuenta que queda apuntada en un borrador después de una respuesta del servidor.
 *
 * **Sólo el servidor nombra dueños.** Un borrador con cuenta conserva la suya. Uno SIN cuenta sólo la
 * gana si el servidor la dice, y la dice únicamente al retenerlo (`cuentaDelBorrador` de la respuesta):
 * pasa a ser del dueño que el servidor nombró y deja de contarse como propio. Cualquier otra respuesta
 * lo deja sin cuenta. Antes se le apuntaba la de quien envía, pero los rechazos del parseo
 * (`parsearMutaciones`) nunca pasaron por `duenoDelBorrador`: un legado de A rechazado por, p. ej.,
 * `sample_code_required` al enviarlo B habría pasado a ser de B, descartable por B y procesable como B.
 */
export function cuentaTrasRespuesta(
  cuentaDelBorrador: string | null | undefined,
  r: RespuestaDeUnBorrador,
): string | null {
  if (cuentaDelBorrador != null) return cuentaDelBorrador;
  return r.cuentaDelBorrador ?? null;
}

export type Desenlace<T> = { tipo: "enviado" } | { tipo: "retenido"; borrador: T } | { tipo: "rechazado"; borrador: T };

/**
 * Qué hace una cola con la respuesta del servidor a uno de sus borradores.
 *
 * - `enviado`: `applied` o `duplicate`. Se descarta.
 * - `retenido`: de otra cuenta. **Sigue pendiente, nunca pasa a error**: no hay nada mal en él, sólo
 *   que no es de quien envía. Si la pantalla lo mostrara como rechazado, ofrecería descartarlo.
 * - `rechazado`: el servidor lo evaluó y lo negó. Error, con su motivo.
 *
 * Un estado que no conoce se trata como rechazo y no como envío: darlo por enviado lo borraría del
 * teléfono sin que nadie supiera si llegó.
 */
export function desenlaceDeUnBorrador<T extends ConCuenta & { status: string; errorMessage?: string }>(
  borrador: T,
  r: RespuestaDeUnBorrador,
): Desenlace<T> {
  if (r.status === "applied" || r.status === "duplicate") return { tipo: "enviado" };
  const cuenta = cuentaTrasRespuesta(borrador.cuenta, r);
  if (esRetencion(r)) return { tipo: "retenido", borrador: { ...borrador, cuenta } };
  return { tipo: "rechazado", borrador: { ...borrador, cuenta, status: "error", errorMessage: r.reason ?? "rejected" } };
}

/**
 * Lo que el botón «descartar fallidas» puede borrar: los borradores en error de ESTA cuenta.
 *
 * Antes borraba todo lo que estuviera en error, incluidos los borradores de otra cuenta que el
 * servidor había rechazado por falta de acceso: trabajo de A destruido desde la sesión de B. Un
 * borrador sin cuenta tampoco entra: sólo gana una cuando el servidor nombra a su dueño al retenerlo
 * (`cuentaTrasRespuesta`). Mientras no la tenga, no se puede descartar a mano; lo purga la regla de 21 días.
 */
export function descartablesPorEstaCuenta<T extends ConCuenta & { status: string }>(
  borradores: readonly T[],
  cuentaActual: string | null,
): T[] {
  if (cuentaActual === null) return [];
  return borradores.filter((b) => b.status === "error" && b.cuenta === cuentaActual);
}

/**
 * El servidor se niega a procesar un borrador de otra cuenta. Lo lanzan las fotos
 * (`lib/traceability/landMedia.ts`) y lo traducen sus acciones a `{ retenida: true }`.
 */
export class BorradorAjenoError extends Error {
  readonly cuentaDelDueno: string | null;

  constructor(cuentaDelDueno: string | null) {
    super(RAZON_BORRADOR_AJENO);
    this.cuentaDelDueno = cuentaDelDueno;
  }
}
