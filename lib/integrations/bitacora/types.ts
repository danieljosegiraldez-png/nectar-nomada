/**
 * A9.12 (D10b) — INTEGRATIONS.md §1: la frontera de la bitácora.
 *
 * **El ticket es la forma, no el canal.** Aquí no hay WhatsApp, ni correo, ni
 * proveedor ninguno: sólo la interfaz que cualquiera de ellos tendrá que
 * cumplir, y un destino de prueba que la implementa. Los cuatro adaptadores
 * están explícitamente fuera de alcance (D10), y WhatsApp además exige una
 * plantilla aprobada por Meta y tiene costo por conversación — dos cosas que no
 * se han verificado.
 *
 * ## Por qué esto no se aplaza aunque el canal sí
 *
 * ADR-044 aplazó las notificaciones con un argumento correcto: «una notificación
 * construida en v1.1 funciona exactamente igual que una construida en v1».
 * Eso vale para la **entrega**. No vale para la **bitácora**, que es un registro
 * con fecha de inicio: un hilo que empieza en marzo no puede contener febrero.
 *
 * Pero la consecuencia no es construir el canal ya. Lo que no se puede aplazar
 * es que **exista el registro**, y el registro ya existe: `AuditEvent`. La
 * bitácora es un **espejo** de él. Lo que este módulo asegura es que el espejo
 * sea posible después — que el día que haya canal, el retroactivo se pueda
 * emitir leyendo el mismo sitio.
 *
 * ## Enlace, no contenido. Y no es una preferencia de estilo.
 *
 * La bitácora llega a un **teléfono**, no a una cuenta. Quien lo tenga en la
 * mano lee lo que llegue, y RBAC no interviene en esa pantalla. Por eso
 * `MensajeDeBitacora` lleva `enlace` y **cifras**, nunca el contenido del
 * registro: el enlace vuelve a pasar por la compuerta al abrirse; el texto no.
 *
 * Es una restricción de seguridad que además resuelve el volumen — un resumen
 * de visita con cada inspección dentro sería ilegible en un chat.
 */

/** Un mensaje de bitácora. Sin payload del registro: ver la cabecera. */
export interface MensajeDeBitacora {
  /**
   * Idempotencia. Se deriva de lo que lo causó —la visita, o el `AuditEvent`
   * concreto— para que reintentar una emisión no duplique el hilo.
   */
  clave: string;
  /** `resumen` al cerrar una visita; `inmediato` para lo que no espera al cierre. */
  clase: "resumen" | "inmediato";
  /** Texto ya legible. Cifras y nombres, nunca el `before`/`after` de un registro. */
  texto: string;
  /**
   * A dónde ir a ver el detalle. Relativo, no absoluto: quien entregue el
   * mensaje sabe en qué origen vive la aplicación, y este módulo no.
   */
  enlace: string;
  /** Cuándo ocurrió lo que se espeja — no cuándo se emite. */
  occurredAt: Date;
}

export interface DestinoDeBitacora {
  /**
   * Entrega, o registra el intento. **No lanza**: una bitácora que tumba el
   * cierre de una visita por no poder entregar convierte un espejo en una
   * dependencia dura, que es exactamente lo que D10 dice que no debe ser.
   */
  entregar(mensajes: readonly MensajeDeBitacora[]): Promise<void>;
}
