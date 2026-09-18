/**
 * La condición del SITIO que alguien vio al visitar -- ADR-165. Puro, sin `prisma`: los
 * formularios de visita son de cliente.
 *
 * **De dónde sale la lista.** De `protocolos/apiario-campo-v2.json`, que es donde el dueño
 * cambia qué se pregunta: en la v1 era una línea de texto con la pista «Hormigas, moho, dosel,
 * agua, cerca». Daniel eligió el 2026-09-18 los valores sobre los ejemplos del Anexo B y la guía
 * de Varroa (el pasto alto alrededor de los soportes), y separó «agua» en DOS: falta y exceso.
 *
 * **`sin_novedad` es una respuesta, no un hueco.** «Miré y el sitio está bien» y «nadie miró»
 * son hechos distintos (ADR-080); sin esta opción, los dos se guardarían igual: vacío.
 */
import type { SiteCondition } from "../../generated/prisma/client";

export class CondicionDelSitioInvalida extends Error {}

/** En el orden del protocolo. */
export const CONDICIONES_DEL_SITIO = [
  "hormigas",
  "moho_humedad",
  "pasto_alto",
  "cerca_caida",
  "dosel_cerrado",
  "fuente_de_agua_seca",
  "encharcamiento",
  "sin_novedad",
  "otro",
] as const satisfies readonly SiteCondition[];

function esCondicion(v: unknown): v is SiteCondition {
  return typeof v === "string" && (CONDICIONES_DEL_SITIO as readonly string[]).includes(v);
}

/**
 * Las condiciones marcadas, validadas, sin repetir y en el orden del protocolo, con la nota de
 * «otro». **Una lista vacía devuelve `null`**: no se marcó nada, que es «sin registrar», y quien
 * llama no debe tocar la columna.
 *
 * Rechaza: un valor fuera de la lista; «sin novedad» junto a otra cosa; «otro» sin decir cuál; y
 * una nota sin «otro», que describiría algo que nadie marcó.
 */
export function normalizarCondicionDelSitio(
  valores: readonly unknown[],
  notaOtro: string | null | undefined,
): { conditions: SiteCondition[]; otherNote: string | null } | null {
  const nota = notaOtro?.trim() || null;
  if (valores.length === 0) {
    if (nota) throw new CondicionDelSitioInvalida("nota_sin_otro");
    return null;
  }
  for (const v of valores) if (!esCondicion(v)) throw new CondicionDelSitioInvalida(`condicion_desconocida:${String(v)}`);
  const marcadas = new Set(valores as SiteCondition[]);
  if (marcadas.has("sin_novedad") && marcadas.size > 1) throw new CondicionDelSitioInvalida("sin_novedad_va_sola");
  if (marcadas.has("otro") && !nota) throw new CondicionDelSitioInvalida("otro_sin_decir_cual");
  if (!marcadas.has("otro") && nota) throw new CondicionDelSitioInvalida("nota_sin_otro");
  return { conditions: CONDICIONES_DEL_SITIO.filter((c) => marcadas.has(c)), otherNote: marcadas.has("otro") ? nota : null };
}
