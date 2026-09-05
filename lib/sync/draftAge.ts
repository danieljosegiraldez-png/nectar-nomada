/**
 * La regla de edad de un borrador sin sincronizar, en un sitio que no es de
 * nadie.
 *
 * **De dónde viene.** A5.5 §4 la decidió para la cola de apiario: los
 * borradores viven en IndexedDB **en claro**, así que un aparato perdido o
 * robado expone trabajo de campo sin sincronizar. La mitigación no es cifrar
 * —la clave acabaría en el mismo almacenamiento que protege— sino acotar la
 * ventana: avisar a los 7 días, purgar a los 21.
 *
 * **Por qué se mueve aquí ahora (P4 §10).** La cola de campo necesita
 * exactamente la misma regla, y copiarla habría dejado dos números que se
 * pueden separar sin que nadie lo note — dos ventanas de exposición distintas
 * para el mismo riesgo, y ninguna de las dos evidente. `lib/apiary/offlineQueue`
 * la re-exporta para no tocar a sus llamadores ni a sus tests, que son los que
 * garantizan que el traslado no cambió nada.
 *
 * Pura a propósito: decide, no borra. Lo que borra vive en cada cola, y así la
 * regla se puede leer y probar sin navegador.
 */

export const STALE_WARNING_DAYS = 7;
export const STALE_PURGE_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DraftAgeVerdict = "purge" | "warn" | "keep";

/**
 * El orden importa: `purge` se comprueba primero, así que un borrador pasado
 * el corte se purga en vez de sólo avisarse.
 */
export function classifyDraftAge(createdAt: number, now: number): DraftAgeVerdict {
  const ageDays = (now - createdAt) / DAY_MS;
  if (ageDays >= STALE_PURGE_DAYS) return "purge";
  if (ageDays >= STALE_WARNING_DAYS) return "warn";
  return "keep";
}
