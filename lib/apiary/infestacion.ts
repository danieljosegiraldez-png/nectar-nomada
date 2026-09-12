/**
 * La aritmética de la infestación y el vocabulario de métodos. **Sin base de
 * datos**, a propósito.
 *
 * Vive separado de `lib/apiary/varroa.ts` por la misma razón por la que
 * `lib/sync/draftAge.ts` se separó de la cola: el formulario de captura es
 * `"use client"` y enseña el porcentaje **mientras se teclea** —300 abejas, 9
 * ácaros, 3 %—, así que necesita esta función; importar el servicio la traería
 * con `prisma` detrás, al paquete del navegador.
 *
 * `lib/apiary/varroa.ts` lo re-exporta, así que nadie más tiene que saber que
 * son dos archivos.
 */
import type { VarroaMethod } from "../../generated/prisma/client";

/** Una entrada que el servicio rechaza. Se distingue de la falta de permiso. */
export class VarroaValidationError extends Error {}

/**
 * Los métodos que el servidor acepta, como lista y no sólo como tipo.
 *
 * **Existe porque un tipo no viaja por HTTP.** El formulario manda una cadena y
 * la cola offline manda una cadena; `as never` sobre ellas apaga al compilador
 * y deja entrar cualquier valor del enum (ADR-112, y el guardia de
 * `procedencia-declarada`). Aquí la frontera es una función que falla.
 */
export const METODOS_DE_VARROA = ["alcohol", "azucar", "bandeja", "otro"] as const satisfies readonly VarroaMethod[];

export function esMetodoDeVarroa(valor: unknown): valor is VarroaMethod {
  return typeof valor === "string" && (METODOS_DE_VARROA as readonly string[]).includes(valor);
}

export function exigeMetodoDeVarroa(valor: unknown): VarroaMethod {
  if (!esMetodoDeVarroa(valor)) throw new VarroaValidationError("metodo_desconocido");
  return valor;
}

/**
 * Cuántos ácaros por cien abejas. **El umbral de tratamiento se lee de aquí**, así
 * que la convención importa: se devuelve en por ciento, no en tanto por uno.
 *
 * Función pura y exportada a propósito — así se prueba con la entrada hostil sin
 * construir una colonia entera, que es la disciplina que `CLAUDE.md` pide para
 * cualquier cosa que vaya a llamarse guardia.
 */
export function infestacionPorCiento(sampleBees: number, mitesCounted: number): number {
  // El cero en el denominador no se «protege» devolviendo cero: eso afirmaría
  // que no hay infestación. El servicio lo rechaza antes, y aquí se deja claro
  // que la pregunta no tiene respuesta.
  if (sampleBees <= 0) throw new VarroaValidationError("muestra_vacia");
  return (mitesCounted / sampleBees) * 100;
}
