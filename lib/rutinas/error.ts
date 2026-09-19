/**
 * Separado de `rutinas.ts` para romper el import circular con `lugares.ts`
 * (spec 2026-09-19 §4.2): `lugares.ts` necesita `RutinaError` y `rutinas.ts`
 * necesita `lugarParaRutina`/`puedeSobreLugar` de `lugares.ts`. `rutinas.ts`
 * reexporta esta clase para que las importaciones existentes no cambien.
 */
export class RutinaError extends Error {}
