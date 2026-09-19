import { ConcesionError } from "../../../lib/traceability/concesiones";
import { LocationAccessError } from "../../../lib/traceability/locations";

/**
 * Traduce `ConcesionError`/`LocationAccessError` a una clave de
 * `AjustesDelBeneficio` (`error_<clave>`), para `concederEdicionFormAction` y
 * `quitarEdicionFormAction`.
 *
 * No vive en `app/actions/beneficios.ts` porque ese archivo es `"use server"`
 * y sólo puede exportar funciones `async`
 * (`tests/arquitectura/use-server-solo-async.test.ts`): esta función es
 * síncrona a propósito, para poder probarla directamente sin pasar por una
 * acción de formulario.
 *
 * **Fix round 1 (hallazgo de revisión).** La primera versión devolvía
 * `error.message` de un `LocationAccessError` tal cual. Las tres funciones de
 * `concesiones.ts` empiezan por `exigeEditarBeneficioEn`, que puede lanzar
 * `"location_not_found"` (un `beneficioId` viejo, o borrado entre que se
 * pintó la pantalla y que alguien envió el formulario) — y no existe
 * `AjustesDelBeneficio.error_location_not_found`, así que `next-intl` habría
 * impreso la clave cruda en vez de un texto. Se colapsa a `no_encontrado`,
 * la misma clave que `guardarBeneficioFormAction` usa para el mismo caso en
 * `app/actions/beneficios.ts`.
 */
export function mensajeDeConcesion(error: unknown): string {
  if (error instanceof ConcesionError) return error.message;
  if (error instanceof LocationAccessError) {
    return error.message === "location_not_found" ? "no_encontrado" : error.message;
  }
  throw error;
}
