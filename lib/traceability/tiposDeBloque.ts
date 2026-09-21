/**
 * Los dos tipos de bloque — F2 §5 extendido (ADR-080: `null` es «sin
 * registrar», nunca un tipo supuesto).
 *
 * **Por qué un archivo propio.** La lista vivía escrita a mano tres veces —
 * `lib/traceability/plotBlocks.ts`, `AltaDeBloqueForm.tsx` y
 * `AsignarTipoDeBloqueForm.tsx`—, y las dos últimas son componentes cliente:
 * no pueden importar `plotBlocks.ts`, que trae `../db` y el cliente de
 * Prisma. Este módulo no importa nada de Prisma ni de la base, así que los
 * tres pueden importar de aquí sin arrastrar el servidor al bundle del
 * navegador. (Revisión de la Tarea 1, hallazgo Importante #1.)
 *
 * **«microparcela» ya no es un tipo de bloque.** Decisión de Daniel,
 * 2026-09-19: una microparcela es una Location `plot` hija de otra `plot`
 * (creada con `createMicrolot`, spec fincas y parcelas §3.3), no una zona con
 * nombre dentro de una parcela. No es la Location `micro_plot` del enum —
 * ese valor existe en el esquema pero nada lo produce.
 */
export const TIPOS_DE_BLOQUE = ["trampa", "experimental"] as const;

export type TipoDeBloque = (typeof TIPOS_DE_BLOQUE)[number];
