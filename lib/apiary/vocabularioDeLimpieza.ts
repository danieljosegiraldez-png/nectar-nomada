/**
 * El vocabulario de la limpieza de la caja (ADR-159). Puro, sin `prisma`: el formulario es de
 * cliente, y el guardia tiene que poder llamarlo con la entrada hostil sin levantar una base.
 *
 * **De dónde salen los nombres.** De `docs/dominio/varroa-inspeccion-desinfeccion.md`, que es
 * borrador. Se toman los NOMBRES de los procedimientos, no sus cifras (ADR-158).
 */
import type { HiveCleaningAct, HiveCleaningReason } from "../../generated/prisma/client";

export class LimpiezaInvalida extends Error {}

/**
 * En el orden en que se hacen, no alfabético: primero la vía térmica (raspar, luego flamear),
 * después la química (sumergir, aclarar, secar), y la renovación de cera, que es otra cosa.
 */
export const ACTOS_DE_LIMPIEZA = [
  "raspado",
  "flameado",
  "inmersion_sosa",
  "aclarado",
  "secado_al_sol",
  "renovacion_de_cera",
  "otro",
] as const satisfies readonly HiveCleaningAct[];

export const RAZONES_DE_LIMPIEZA = [
  "baja_de_colonia",
  "fusion_de_colonias",
  "renovacion_programada",
  "sospecha_de_enfermedad",
  "otro",
] as const satisfies readonly HiveCleaningReason[];

/**
 * Los actos que **exigen la caja vacía**. El manual lo dice de todo el protocolo de higiene
 * —se aplica «cuando el material queda vacío»— y es físico: no se flamea ni se hierve en sosa
 * una caja con abejas dentro.
 *
 * **`renovacion_de_cera` NO está, y es la única excepción, a propósito.** Cambiar los cuadros más
 * oscuros de la cámara de cría se hace **con la colonia dentro** —el manual la pone en
 * «gestión ambiental», junto a la cría viva—. Exigir caja vacía para ella la haría imposible de
 * registrar en el único caso en que ocurre.
 *
 * **`otro` tampoco está**, porque no se sabe qué es: un «otro» con la caja ocupada puede ser
 * perfectamente legítimo, y bloquearlo sería decidir por el apicultor algo que él no ha dicho.
 */
export const ACTOS_QUE_EXIGEN_CAJA_VACIA: ReadonlySet<HiveCleaningAct> = new Set([
  "raspado",
  "flameado",
  "inmersion_sosa",
  "aclarado",
  "secado_al_sol",
]);

export function esActoDeLimpieza(v: unknown): v is HiveCleaningAct {
  return typeof v === "string" && (ACTOS_DE_LIMPIEZA as readonly string[]).includes(v);
}

export function esRazonDeLimpieza(v: unknown): v is HiveCleaningReason {
  return typeof v === "string" && (RAZONES_DE_LIMPIEZA as readonly string[]).includes(v);
}

/**
 * Valida la forma de una limpieza, sin base. **Es la misma regla que los `CHECK` de la
 * migración**, repetida aquí sólo para dar un mensaje legible: la base es la que la hace
 * cumplir de verdad, también contra un importador o SQL directo.
 */
export function exigeLimpieza(input: {
  acts: readonly string[];
  actOtherNote?: string | null;
  reason?: string | null;
  reasonOtherNote?: string | null;
}): { acts: HiveCleaningAct[]; reason: HiveCleaningReason | null } {
  if (input.acts.length === 0) throw new LimpiezaInvalida("sin_actos");
  const acts: HiveCleaningAct[] = [];
  for (const a of input.acts) {
    if (!esActoDeLimpieza(a)) throw new LimpiezaInvalida(`acto_desconocido: ${a}`);
    // Un acto repetido no afirma nada más; se guarda una vez.
    if (!acts.includes(a)) acts.push(a);
  }
  if (acts.includes("otro") && (input.actOtherNote ?? "").trim() === "") {
    throw new LimpiezaInvalida("otro_sin_decir_cual");
  }

  let reason: HiveCleaningReason | null = null;
  if (input.reason != null && input.reason.trim() !== "") {
    if (!esRazonDeLimpieza(input.reason)) throw new LimpiezaInvalida(`razon_desconocida: ${input.reason}`);
    reason = input.reason;
    if (reason === "otro" && (input.reasonOtherNote ?? "").trim() === "") {
      throw new LimpiezaInvalida("razon_otro_sin_decir_cual");
    }
  }
  return { acts, reason };
}

/** Si alguno de los actos exige la caja vacía. */
export function exigeCajaVacia(acts: readonly HiveCleaningAct[]): boolean {
  return acts.some((a) => ACTOS_QUE_EXIGEN_CAJA_VACIA.has(a));
}
