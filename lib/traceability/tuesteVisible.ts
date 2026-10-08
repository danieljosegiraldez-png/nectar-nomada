/**
 * ADR-043 — cuándo el informe de un lote puede decir QUÉ tueste se cató.
 *
 * **Por qué existe.** `getSensoryLinkageForSamples` se abrió con `lot:view` (no con
 * `blind_mapping:view`) para que un Farm Operator vea la nota de su lote. Eso es correcto mientras
 * lo que devuelve no ayude a adivinar qué hay en la mesa. El tueste que corresponde a cada muestra
 * sí ayuda: nivel, fecha, tostador y equipo de una cata **abierta** son justo lo que un juez no debe
 * saber. Y el caso no es hipotético: medido en producción el 2026-10-08, **Bob Huerbsch tiene a la
 * vez Farm Operator/Farm Manager (ve lotes) y Sensory Judge**.
 *
 * **La regla.** El tueste sale cuando el mapeo se reveló, o la sesión ya cerró (`completed` o
 * `locked`). Con la cata en `draft`, `blind_coding` o `in_progress` y sin revelar, no.
 *
 * **Qué NO resuelve, dicho una vez.** El tueste de un lote sigue siendo consultable por quien
 * pueda ver ese lote en sus propias pantallas; lo que esta regla impide es que el INFORME diga cuál
 * de ellos está en una cata abierta. Es la mitad del mapeo que el informe aportaba, no toda la
 * ceguera: la otra mitad —el código ciego— nunca sale de `blind_mapping:view`.
 */
export const SESIONES_CERRADAS = ["completed", "locked"] as const;

export function tuesteVisible(revelado: boolean, estadoDeLaSesion: string): boolean {
  return revelado || (SESIONES_CERRADAS as readonly string[]).includes(estadoDeLaSesion);
}
