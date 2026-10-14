/**
 * ADR-199 — quién entró por última vez en este navegador, según el servidor.
 *
 * Las tres colas offline leen de aquí de quién es un borrador al guardarlo y qué pueden enviar. Lo
 * escribe `ServiceWorkerRegistration`, el mismo componente que alinea las páginas guardadas (#703),
 * con lo que le pasa el layout en cada carga: la huella de la cuenta y la hora del servidor.
 *
 * **Por qué una clave propia y no `nn-pages-cuenta`.** Ésa responde a otra pregunta —para quién son
 * las páginas guardadas— y sólo se apunta DESPUÉS de borrarlas. Si borrar la caché falla, queda vacía,
 * y un borrador anotado entonces saldría sin cuenta, es decir, por la regla del aparato, a nombre de
 * quien no lo escribió.
 *
 * **Por qué la hora.** Si borrar la caché falló y una página de A sigue guardada, B puede abrirla sin
 * señal, y ese HTML trae la huella de A. La hora de A es anterior a la de B, porque B tuvo que entrar
 * con señal, así que no gana.
 *
 * Sólo cliente: `localStorage` no existe en el servidor. Sin él (navegación privada), no hay cuenta, y
 * los borradores los decide el servidor por el aparato.
 */

export const CLAVE_CUENTA_DEL_NAVEGADOR = "nn-cuenta-del-navegador";

export interface CuentaApuntada {
  /** La huella de la cuenta (`lib/auth/huellaDeCuenta.ts`), o `null` si la página se generó sin sesión. */
  cuenta: string | null;
  /** Hora del servidor, en milisegundos, a la que se generó la página. */
  generadaEn: number;
}

/** Lo que haya en la clave, si tiene la forma; cualquier otra cosa es «nada». */
export function leerCuentaApuntada(raw: string | null): CuentaApuntada | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { cuenta, generadaEn } = v as { cuenta?: unknown; generadaEn?: unknown };
    if (typeof generadaEn !== "number" || !Number.isFinite(generadaEn)) return null;
    if (cuenta === null) return { cuenta: null, generadaEn };
    if (typeof cuenta === "string" && cuenta !== "") return { cuenta, generadaEn };
    return null;
  } catch {
    return null;
  }
}

/** Gana la página generada más tarde; un empate lo gana la nueva. */
export function cuentaVigente(guardada: CuentaApuntada | null, nueva: CuentaApuntada): CuentaApuntada {
  return guardada !== null && guardada.generadaEn > nueva.generadaEn ? guardada : nueva;
}

export function apuntarCuentaDelNavegador(nueva: CuentaApuntada): void {
  try {
    const vigente = cuentaVigente(leerCuentaApuntada(localStorage.getItem(CLAVE_CUENTA_DEL_NAVEGADOR)), nueva);
    if (vigente === nueva) localStorage.setItem(CLAVE_CUENTA_DEL_NAVEGADOR, JSON.stringify(nueva));
  } catch {
    // No se pudo escribir. Si ya había una entrada, seguiría mandando la ANTERIOR —p. ej. la de A cuando ya
    // entró B— y las colas guardarían y enviarían a nombre de quien ya no es. Se intenta quitarla para caer a
    // «sin cuenta»: los borradores quedan sin cuenta y el servidor los decide por el aparato. Si ni quitarla
    // se puede (sin almacenamiento local), tampoco hay entrada que lea nadie.
    try {
      localStorage.removeItem(CLAVE_CUENTA_DEL_NAVEGADOR);
    } catch {
      // Sin almacenamiento local.
    }
  }
}

export function cuentaActualDelNavegador(): string | null {
  try {
    return leerCuentaApuntada(localStorage.getItem(CLAVE_CUENTA_DEL_NAVEGADOR))?.cuenta ?? null;
  } catch {
    return null;
  }
}
