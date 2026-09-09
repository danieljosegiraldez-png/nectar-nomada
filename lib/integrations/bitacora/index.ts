import { DestinoEnMemoria } from "./enMemoria";
import type { DestinoDeBitacora } from "./types";

/**
 * INTEGRATIONS.md §1: la fábrica. La lógica de negocio importa de aquí y
 * **nunca** de un archivo de proveedor.
 *
 * Hoy hay un solo destino y por eso no hay `if` sobre variable de entorno: un
 * selector con una sola rama es una decisión disfrazada de configuración.
 * Cuando entre el primero de verdad —A9.11 trae el modelo de preferencias, y
 * los adaptadores son otro ticket— la rama se añade aquí y en ningún otro sitio.
 */
export const destinoDeBitacora: DestinoDeBitacora = new DestinoEnMemoria();

export { DestinoEnMemoria } from "./enMemoria";
export type { DestinoDeBitacora, MensajeDeBitacora } from "./types";
