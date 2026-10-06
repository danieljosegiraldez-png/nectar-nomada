/**
 * El error de la receta con pasos — Parte 2a, tarea 3 (2026-10-03): el borrador, los pasos, las metas por paso y publicar.
 *
 * **Gemelo de `lib/traceability/errorDeProceso.ts`, y por la misma razón vive en su propio archivo:** `friendlyError` no se
 * exporta (su archivo es `"use server"`), así que la decisión «qué texto tiene este error» tiene que vivir en `lib/` para poder
 * PROBARLA. Y no importa nada: lo lanzan `lib/recetas/autoria.ts`, `lib/recetas/pasos.ts` y `validateTargets`
 * (`lib/traceability/processTargets.ts`), y la prueba de sus textos (`tests/recetas/mensajesDeReceta.test.ts`) es hermética.
 *
 * **Por qué una clase nueva y no `ProcessTargetError`.** Los códigos de `ProcessTargetError` salen todos por un mensaje
 * genérico con el código crudo en inglés («No se pudo guardar la receta: duplicate_variable_and_moment»). Los de aquí tienen
 * texto propio desde que nacen (registro del plan 2a: «los códigos de error de receta ganan texto propio con un mecanismo
 * hermano de `claveDeErrorDeProceso`»). Los de `ProcessTargetError` no se mueven: las pruebas de hoy los comparan.
 *
 * El mensaje ES el código, como en `LotProcessError`.
 */
export class RecipeError extends Error {}

/**
 * Los códigos que tienen su texto en `messages/*.json` (`Traceability.error_receta_<código>`): todos los que lanza la tarea 3.
 * Un código que añada otra tarea entra aquí con su texto en el mismo cambio.
 */
export const CODIGOS_DE_RECETA_TRADUCIDOS = [
  // Autoría (V16, decisión de Daniel del 2026-10-04): quién escribe y publica recetas, y la lectura de sus pasos.
  "sin_permiso_de_autoria",
  "organizacion_sin_lotes",
  // Borrador y publicar (diseño §3.3).
  "version_no_encontrada",
  "version_no_es_borrador",
  "version_sin_pasos",
  // La lista de pasos.
  "paso_no_encontrado",
  "posicion_invalida",
  // El paso y sus ejes (diseño §3 y §3.5).
  "tipo_de_paso_desconocido",
  "eje_no_aplica",
  "valor_de_otro_catalogo",
  "horas_invalidas",
  "fin_por_tiempo_sin_horas",
  "solo_en_secado",
  "porcentaje_fuera_de_rango",
  "mucilago_fuera_de_tramos",
  "rango_invalido",
  "adicion_invalida",
  "fin_invalido",
  "lectura_no_marcada",
  "meta_de_recepcion_no_se_vigila",
  // Metas por paso (diseño §3.2; el nombre es de la lista del §12).
  "paso_de_otra_version",
] as const;

export type CodigoDeRecetaTraducido = (typeof CODIGOS_DE_RECETA_TRADUCIDOS)[number];

/**
 * La clave de `Traceability` de un error de receta, o null si no tiene texto propio. Mira la clase Y el código, como
 * `claveDeErrorDeProceso`: un `Error` cualquiera con el mensaje `version_no_es_borrador` no es de la receta.
 */
export function claveDeErrorDeReceta(error: unknown): `error_receta_${CodigoDeRecetaTraducido}` | null {
  if (error instanceof RecipeError && (CODIGOS_DE_RECETA_TRADUCIDOS as readonly string[]).includes(error.message)) {
    return `error_receta_${error.message as CodigoDeRecetaTraducido}`;
  }
  return null;
}
