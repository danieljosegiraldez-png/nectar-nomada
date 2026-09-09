/**
 * A9.11 (D10a) — INTEGRATIONS.md §1: la frontera de mensajería.
 *
 * **Esto es el contrato, no la integración.** Ningún proveedor: ni WhatsApp, ni
 * SMS, ni nada. D10 deja los cuatro adaptadores explícitamente fuera de alcance,
 * y WhatsApp además exige plantilla aprobada por Meta y tiene costo por
 * conversación iniciada por el negocio — dos cosas que no se han verificado.
 *
 * ## Lo que YA está fijado y aquí no se rehace
 *
 * `INTEGRATIONS.md` §5 y §9 ya definen dos de los cuatro canales:
 *
 *   * **Correo** — `EmailProvider.send(template, recipient, data)`
 *   * **Calendario** — `CalendarProvider.createEvent / updateEvent / sendInvite`
 *
 * Están **especificados y sin implementar**: medido, no hay ni un
 * `EmailProvider` ni un `CalendarProvider` en `lib/`. Este archivo no los
 * duplica ni los redefine — describe el canal que ninguno de los dos cubre, que
 * es el mensaje corto a un dispositivo.
 *
 * ## Por qué la plantilla es un identificador y no un texto
 *
 * Mismo motivo que `EmailProvider.send(template, ...)`: WhatsApp **obliga** a
 * usar plantillas aprobadas para iniciar conversación, así que un proveedor que
 * aceptara texto libre no podría cumplir su propia API. Fijarlo aquí evita que
 * la lógica de negocio se escriba contra una libertad que el canal no da.
 */

/** Los cuatro que D10 nombra. `in_app` es la prioridad declarada de `CLAUDE.md` §34. */
export type CanalDeAviso = "in_app" | "email" | "whatsapp" | "calendar";

export interface MensajeSaliente {
  /** A quién. Una `Person`, no una `UserAccount`: la mayoría no tiene cuenta. */
  personId: string;
  /** Identificador de plantilla, no texto. Ver la cabecera. */
  plantilla: string;
  /** Los valores que la plantilla rellena. Nunca el registro entero. */
  datos: Readonly<Record<string, string | number>>;
  /**
   * A dónde ir a ver el detalle, relativo. Lo mismo que la bitácora (A9.12) y
   * por la misma razón: el mensaje llega a un dispositivo donde RBAC no
   * interviene, y el enlace sí vuelve a pasar por la compuerta al abrirse.
   */
  enlace: string;
}

export interface ResultadoDeEnvio {
  entregado: boolean;
  /** Por qué no, cuando no. Para poder decirlo en vez de fallar en silencio. */
  motivo?: string;
}

export interface MessagingProvider {
  /** Qué canal implementa este proveedor. Un proveedor, un canal. */
  readonly canal: CanalDeAviso;
  send(mensaje: MensajeSaliente): Promise<ResultadoDeEnvio>;
}
