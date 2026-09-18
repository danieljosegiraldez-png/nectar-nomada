/**
 * El vocabulario de procesar miel (ADR-161). Puro, sin `prisma`: el formulario es de cliente,
 * y el guardia tiene que poder llamarlo con la entrada hostil sin levantar una base.
 *
 * **En el orden en que se hacen**: se cuela al salir del extractor, se filtra más fino, se deja
 * decantar y madurar en el madurador, y se homogeniza antes de envasar. «Otro, ¿cuál?» para lo
 * que no entra (Daniel: vocabularios fijos, con salida para lo que no está).
 */
import type { HoneyProcessAct } from "../../generated/prisma/client";

export class MielInvalida extends Error {}

export const ACTOS_DE_PROCESO_DE_MIEL = [
  "colado",
  "filtrado",
  "decantacion_maduracion",
  "homogenizado",
  "otro",
] as const satisfies readonly HoneyProcessAct[];

export function esActoDeProcesoDeMiel(v: unknown): v is HoneyProcessAct {
  return typeof v === "string" && (ACTOS_DE_PROCESO_DE_MIEL as readonly string[]).includes(v);
}

/**
 * Los actos, validados, sin repetir, en el orden del vocabulario —no en el que llegaron—, y
 * la nota de «otro».
 *
 * **Lo que rechaza:** ningún acto; un acto que no está en la lista; «otro» sin decir cuál; y
 * una nota de «otro» sin «otro» marcado — una nota huérfana describiría un acto que nadie
 * declaró haber hecho.
 */
export function normalizarActosDeMiel(
  actos: readonly unknown[],
  notaOtro: string | null | undefined,
): { acts: HoneyProcessAct[]; otherNote: string | null } {
  if (actos.length === 0) throw new MielInvalida("sin_actos");
  for (const a of actos) if (!esActoDeProcesoDeMiel(a)) throw new MielInvalida(`acto_desconocido:${String(a)}`);
  const marcados = new Set(actos as HoneyProcessAct[]);
  const acts = ACTOS_DE_PROCESO_DE_MIEL.filter((a) => marcados.has(a));
  const nota = notaOtro?.trim() || null;
  if (marcados.has("otro") && !nota) throw new MielInvalida("otro_sin_decir_cual");
  if (!marcados.has("otro") && nota) throw new MielInvalida("nota_sin_otro");
  return { acts, otherNote: marcados.has("otro") ? nota : null };
}

/**
 * Un número de kilos escrito por una persona. Vacío es `null` —no se pesó—, nunca cero.
 * Negativo o no numérico se rechaza con el nombre del campo.
 */
export function kilos(valor: unknown, campo: string): number | null {
  if (valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "")) return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n) || n < 0) throw new MielInvalida(`kilos_invalidos:${campo}`);
  return n;
}
