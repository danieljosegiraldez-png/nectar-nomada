/**
 * Los errores de elegir el recipiente al empezar una fermentación (Parte 2c, arreglos previos §4.1 y decisión D2 de Daniel,
 * 2026-10-04).
 *
 * **Vive en su propio archivo**, como `errorDeProceso.ts` y `bandejaError.ts`: no importa la base ni nada que la importe, así que la
 * acción puede nombrarlo en `friendlyError` y una prueba hermética puede leer su lista sin arrastrar `lib/db`.
 *
 * El mensaje ES el código, como siempre. Hay **uno solo** para «ese tanque no se puede usar»: no distingue «no existe» de «es de otra
 * organización», «es una bandeja», «está retirado» o «no lo ves». Con un código por motivo, el rechazo le diría a quien no ve un
 * tanque que existe (§5.5 del diseño: no se nombra lo que quien opera no puede ver).
 */
export class RecipienteError extends Error {}

/**
 * Los códigos que tienen su propio texto en `messages/*.json` (`Traceability.error_<código>`). `friendlyError` sólo traduce los que
 * están aquí: un código que no esté se relanza en vez de pintar una clave que no existe.
 */
export const CODIGOS_DE_RECIPIENTE = ["recipiente_o_nota_obligatorio", "recipiente_no_disponible"] as const;
