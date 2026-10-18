/**
 * Cuántas mutaciones acepta `/api/v1/sync/field-events` en una sola petición.
 *
 * **Un solo sitio, a propósito.** La ruta responde 413 por encima de este
 * número y las dos colas (`lib/sync/offlineQueue.ts`, `lib/apiary/offlineQueue.ts`)
 * trocean por él. Hasta el 2026-10-11 el 200 vivía sólo en la ruta y las colas
 * mandaban la cola entera: con 201 borradores, los 201 —buenos— quedaban
 * rechazados (`tests/sync/colaMasLargaQueElLote.test.ts`).
 *
 * Sin dependencias: lo importan el servidor y el cliente.
 */
export const TOPE_DEL_LOTE = 200;
