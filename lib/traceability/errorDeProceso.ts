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
  "devolucion_antes_del_cierre",
  // Ronda de arreglo 1 de la revisión final (2026-10-03): decisión de Daniel del 2026-10-02 (R2).
  "descendiente_en_bodega",
  // R7, «una sola línea viva bajo un proceso» (revisión final).
  "corrida_ya_abierta",
  "lote_consumido",
  // R7: la humedad que cierra un proceso no puede ser anterior a su inicio (revisión final).
  "medicion_anterior_al_proceso",
  // Códigos que existían antes de la Parte 1 y salían crudos por el mensaje genérico (revisión final, S7/M1, y registro, línea
  // 255): los tres de la compuerta de bodega, que desde R7 salta en todo pergamino con proceso, y el del doble envío.
  "drying_not_finished",
  "moisture_above_target",
  "no_closing_moisture",
  "process_already_closed",
  // Parte 2a, tarea 5a (2026-10-03): lo que se exige de la versión que se pasa a `abrirProceso` (diseño 2a, §3.3). Los lanza sólo
  // `abrirProceso`, y llegan a la pantalla por `abrirProcesoAction` → `friendlyError` → `claveDeErrorDeProceso`. (`sin_receta`, la
  // obligatoriedad, lo añade la 5b delante de éstos.)
  "version_no_publicada",
  "receta_de_otra_organizacion",
  // Los dos que `abrirProceso` ya lanzaba desde la Parte 1 y salían crudos por el mensaje genérico (ronda de arreglo del
  // 2026-10-04, C14): una receta archivada ENTRE cargar la pantalla y enviarla es un caso real, no sólo un formulario fabricado.
  "recipe_archived",
  "recipe_version_not_found",
] as const;

export type CodigoDeProcesoTraducido = (typeof CODIGOS_DE_PROCESO_TRADUCIDOS)[number];

/**
 * La clave de `Traceability` de un error del proceso, o null si no tiene texto propio (Parte 1, tarea 12, 2026-10-03).
 * Vive aquí, y no en la acción, para poder PROBARLA: `friendlyError` no se exporta (su archivo es "use server").
 *
 * Mira la clase Y el código: un `Error` cualquiera con el mensaje `sin_proceso_abierto` no es del proceso, y un
 * `LotProcessError` con un código que no está en la lista (`process_not_found`…) sigue por el mensaje genérico.
 */
export function claveDeErrorDeProceso(error: unknown): `error_proceso_${CodigoDeProcesoTraducido}` | null {
  if (error instanceof LotProcessError && (CODIGOS_DE_PROCESO_TRADUCIDOS as readonly string[]).includes(error.message)) {
    return `error_proceso_${error.message as CodigoDeProcesoTraducido}`;
  }
  return null;
}
