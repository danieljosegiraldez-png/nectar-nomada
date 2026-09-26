/**
 * Los sistemas de malla del café verde. **Módulo puro a propósito**: lo importa un componente de
 * cliente (`GreenGradingForm`), y traer un valor desde `greenGrading.ts` —que llega a Prisma— mete
 * `pg` en el paquete del navegador y mata `next build` con «Can't resolve 'dns'». Lo vigila
 * `tests/arquitectura/cliente-sin-prisma.test.ts`, que es quien lo cazó al escribirlo.
 *
 * Decisión de Daniel, 2026-09-25: tres, cerrados. `redonda_internacional` es la malla SCA de 8 a 20;
 * `plana_oblonga` cubre caracolillo y granos alargados; `otro` **obliga a escribir cuál** en la nota
 * de la fracción. Antes era texto libre y dos fracciones del mismo lote podían no agruparse nunca.
 */
export const SISTEMAS_DE_MALLA = ["redonda_internacional", "plana_oblonga", "otro"] as const;
export type SistemaDeMalla = (typeof SISTEMAS_DE_MALLA)[number];
