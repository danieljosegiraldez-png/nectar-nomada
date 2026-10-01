/**
 * El error de todo lo que toca el proceso de un lote (Parte 1, 2026-09-30; sacado de `lotProcess.ts`
 * el 2026-10-01, tarea 1).
 *
 * **Vive en su propio archivo** (diseño §3.2): `procesoDelLinaje.ts` y `lots.ts` lo lanzan, y
 * `lotProcess.ts` importa `lots.ts`. Si siguiera en `lotProcess.ts`, lanzarlo desde `lots.ts` cerraría
 * un ciclo de importación. Es el mismo movimiento que ya hizo `bandejaError.ts`.
 *
 * El mensaje ES el código, como siempre: las pruebas comparan `new LotProcessError("…")`.
 */
export class LotProcessError extends Error {}

/**
 * Los códigos que tienen su propio texto en `messages/*.json` (`Traceability.error_proceso_<código>`).
 * Los demás siguen saliendo por el mensaje genérico con el código como detalle.
 */
export const CODIGOS_DE_PROCESO_TRADUCIDOS = [
  "sin_proceso_abierto",
  "lote_dividido",
  "lote_mezclado",
  "lote_en_bodega",
  "proceso_no_aplica_a_miel",
  "corridas_abiertas",
  "division_deja_remanente",
  "seleccion_bajo_proceso_abierto",
  "fusion_bajo_proceso_abierto",
  "receta_distinta_del_proceso",
  "lineage_too_deep",
  "motivo_otro_requiere_nota",
  "process_already_open",
] as const;

export type CodigoDeProcesoTraducido = (typeof CODIGOS_DE_PROCESO_TRADUCIDOS)[number];
