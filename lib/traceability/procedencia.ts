/**
 * Qué procedencia puede afirmar cada pantalla, dicho una vez.
 *
 * **El hueco que cierra, medido el 2026-09-08.** Ocho formularios declaraban su
 * propio subconjunto de `ProvenanceClass` en un `const` local — seis conjuntos
 * distintos, con **dos nombres para la misma idea** (`PROVENANCES` y
 * `PROVENANCE_CLASSES`) y dos formularios ofreciendo **el mismo conjunto en
 * distinto orden**. Nada declaraba por qué, y nada impedía que derivaran.
 *
 * **Y no era sólo desorden.** El enum tiene **diez** valores; los formularios
 * ofrecen **cinco**. En `app/actions/traceability.ts` la cadena del formulario
 * entraba en el enum con `as never` en **once** sitios, así que el servidor
 * aceptaba los diez: un envío con `provenanceClass=ai_suggestion` sobre un
 * formulario que ofrece dos opciones **se guardaba**. Eso hace falsa justo la
 * distinción que `CLAUDE.md` §3 pone primero — hecho medido contra
 * interpretación contra sugerencia de IA.
 *
 * **Lo que este archivo NO cambia:** qué ofrece cada pantalla. Cada conjunto de
 * abajo es el que ya tenía su formulario, valor por valor. Cambiar cuáles son
 * los correctos es una decisión de producto y está anotada en `SESSION_STATE.md`
 * §3; esto sólo hace que estén declarados, compartidos y comprobados.
 *
 * El tipo es `readonly ProvenanceClass[]`, así que **el compilador** rechaza un
 * valor que no exista en el enum. Es la lección del mapa de variables que pasó a
 * `Record` total: un dato que el compilador mantiene es mejor guardia que una
 * lista que hay que acordarse de mirar.
 */
import type { ProvenanceClass } from "../../generated/prisma/client";

/**
 * Una medición y su corrección. Es el único sitio donde la pantalla ofrece
 * `interpretation` y `scientific_evidence`: una medición puede venir de un
 * instrumento, de mirar, de deducir, o de la literatura, y confundirlas es lo
 * que `CLAUDE.md` §3 prohíbe. La corrección ofrece lo mismo que el original a
 * propósito — corregir no estrecha lo que se pudo afirmar.
 */
export const PROCEDENCIA_DE_MEDICION: readonly ProvenanceClass[] = [
  "measured_fact",
  "direct_observation",
  "interpretation",
  "scientific_evidence",
];

/**
 * Lo que se registra estando delante: un tueste, una muestra, una calicata.
 * O lo apuntó quien lo hizo (`original_record`) o lo vio alguien
 * (`direct_observation`). No hay nada que deducir.
 *
 * **Aquí se juntan tres formularios que ya ofrecían esto**, uno de ellos con
 * los dos valores en el orden contrario sin ninguna razón escrita.
 */
export const PROCEDENCIA_DE_REGISTRO_DE_CAMPO: readonly ProvenanceClass[] = [
  "original_record",
  "direct_observation",
];

/**
 * Una siembra. Añade `interpretation` sobre el registro de campo porque el
 * conteo de plantas de una cohorte vieja suele ser una estimación, y decir que
 * lo es vale más que un número que parece contado.
 */
export const PROCEDENCIA_DE_SIEMBRA: readonly ProvenanceClass[] = [
  "original_record",
  "direct_observation",
  "interpretation",
];

/** Un análisis de laboratorio: lo midió el aparato, o lo dice el informe. */
export const PROCEDENCIA_DE_ANALISIS: readonly ProvenanceClass[] = ["measured_fact", "original_record"];

/** Un lote de biochar: se apunta al quemarlo, se observa, o se mide. */
export const PROCEDENCIA_DE_BIOCHAR: readonly ProvenanceClass[] = [
  "original_record",
  "direct_observation",
  "measured_fact",
];

export class ProcedenciaInvalida extends Error {}

/**
 * Devuelve la procedencia si la pantalla podía ofrecerla, o lanza.
 *
 * **Sustituye a `as never`.** Ese `as never` no convertía nada: apagaba al
 * compilador y dejaba pasar los diez valores del enum a un formulario que
 * ofrecía dos. Aquí la lista permitida es la MISMA que pinta la pantalla, así
 * que lo que el servidor acepta y lo que el usuario ve no pueden separarse.
 *
 * Lanza también con la cadena vacía: los seis selects son `required`, así que
 * un vacío significa un envío que no pasó por la pantalla.
 */
export function exigeProcedencia(
  valor: FormDataEntryValue | null,
  permitidas: readonly ProvenanceClass[],
): ProvenanceClass {
  const texto = String(valor ?? "").trim();
  if (texto === "") throw new ProcedenciaInvalida("provenance_required");
  const encontrada = permitidas.find((p) => p === texto);
  if (encontrada === undefined) throw new ProcedenciaInvalida(`provenance_not_offered:${texto}`);
  return encontrada;
}
