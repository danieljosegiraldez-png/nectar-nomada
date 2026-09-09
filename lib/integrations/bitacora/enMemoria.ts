import type { DestinoDeBitacora, MensajeDeBitacora } from "./types";

/**
 * A9.12 — el destino de prueba, que es el único que existe hoy.
 *
 * D10 lo acota así: «sin adaptador, escribe a un destino de prueba». No es un
 * hueco a rellenar con prisa: es lo que permite probar la **forma** del mensaje
 * —qué se dice, con qué clave, con qué enlace— sin haber decidido el canal ni
 * haber verificado el costo por conversación de WhatsApp.
 *
 * Guarda en memoria del proceso. **No persiste**, y no debe: si persistiera,
 * sería un segundo registro compitiendo con `AuditEvent`, que es la fuente. La
 * bitácora es un espejo; un espejo con memoria propia se desincroniza.
 */
export class DestinoEnMemoria implements DestinoDeBitacora {
  private readonly entregados: MensajeDeBitacora[] = [];

  async entregar(mensajes: readonly MensajeDeBitacora[]): Promise<void> {
    this.entregados.push(...mensajes);
  }

  /** Lo entregado hasta ahora, en orden. Para pruebas y para mirar en desarrollo. */
  leer(): readonly MensajeDeBitacora[] {
    return this.entregados;
  }

  vaciar(): void {
    this.entregados.length = 0;
  }
}
