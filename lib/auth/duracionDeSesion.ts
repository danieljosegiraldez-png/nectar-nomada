/**
 * Cuánto dura una sesión, en segundos: el `maxAge` de Auth.js.
 *
 * Vive aparte de `lib/auth/config.ts` porque tiene dos lectores. Uno es esa
 * configuración; el otro, la caducidad de las páginas que `public/sw.js`
 * guarda para abrirlas sin red, que no deben servirse más allá de lo que pudo
 * durar la sesión que las produjo. `sw.js` no puede importar nada, así que
 * lleva la misma cifra escrita a mano, y `tests/offline/service-worker.test.ts`
 * comprueba que las dos coinciden por su conducta, no por su texto.
 *
 * El porqué de los 7 días está en `lib/auth/config.ts` (A5.5 §4).
 */
export const DURACION_DE_SESION_S = 60 * 60 * 24 * 7;
