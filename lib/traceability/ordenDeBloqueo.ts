/**
 * R2 (Parte 1, 2026-10-01). El orden en que `bloquearLinajes` toma las filas de `lot`.
 *
 * Módulo propio, sin imports: es una función pura, y así su prueba corre sin base de datos en el carril
 * hermético de CI.
 *
 * Todas las transacciones que bloquean el linaje tienen que pedir las filas en el MISMO orden, o dos de
 * ellas pueden esperarse la una a la otra. El orden es el de las cadenas, y un uuid llega con la caja que
 * traiga: `startDryingRun` y `startFermentationRun` reciben el `lotId` tal cual sale del formulario, y un
 * uuid en mayúsculas apunta a la misma fila con OTRA posición en el orden («B» va antes que «a», y «b»
 * después). Por eso se normaliza antes de deduplicar y antes de ordenar.
 */
export function ordenDeBloqueo(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.toLowerCase()))].sort();
}
