/**
 * ¿La cereza de un lote cumplió lo que se pidió?
 *
 * Spec: docs/superpowers/specs/2026-09-19-de-la-recepcion-a-los-lotes-design.md §3.4.
 *
 * - **Maduro es lo aceptado** en la selección; verde y flotes son sus rechazos (decisión de Daniel,
 *   2026-09-19). Los porcentajes van sobre el insumo.
 * - **Representa todo lo seleccionado del lote**, no la primera porción: quien llama suma las masas
 *   de todas sus selecciones y esta función juzga la suma.
 * - **No juzga cuando no puede:** balance descuadrado, condiciones de pesaje que no se pueden
 *   comparar, o un lote que no es atribuible a un pedido. Decir «no se sabe» es el veredicto
 *   correcto en esos tres casos; inventar un `CUMPLE` sería peor que no tener nada.
 */
export type JuicioDeCalidad =
  | "CUMPLE"
  | "NO_CUMPLE"
  | "NO_ATRIBUIBLE"
  | "BALANCE_DESCUADRADO"
  | "INCOMPARABLE_WEIGHING_CONDITION"
  | "CONDICION_SIN_DECLARAR";

export type CondicionDePesaje = "DRAINED" | "WET" | "DRY";

export interface MasasDeSelecciones {
  readonly insumoKg: number;
  readonly aceptadoKg: number;
  readonly verdeKg: number;
  readonly flotesKg: number;
  readonly selecciones: number;
}

export interface LimitesDelPedido {
  readonly minMaduroPct?: number | null;
  readonly maxVerdePct?: number | null;
  readonly maxFlotesPct?: number | null;
}

export interface EntradaDelVeredicto {
  readonly masas: MasasDeSelecciones;
  /** `null` = el lote no es atribuible a un pedido. */
  readonly limites: LimitesDelPedido | null;
  /** Una por selección; `null` es «sin declarar», nunca una suposición. */
  readonly condiciones: ReadonlyArray<CondicionDePesaje | null>;
  /** Si alguna de esas selecciones fue por flotación: es la que moja la cereza. */
  readonly huboFlotacion: boolean;
  readonly balanceDescuadrado: boolean;
}

export interface Veredicto {
  readonly juicio: JuicioDeCalidad;
  readonly motivo: string | null;
  readonly maduroPct: number;
  readonly verdePct: number;
  readonly flotesPct: number;
}

const g = (kg: number) => Math.round(kg * 1000);
const pct2 = (parte: number, total: number) => Math.round((parte / total) * 10000) / 100;
/** Centésimas de punto porcentual, la resolución de `Decimal(5,2)`. */
const bp = (pct: number) => Math.round(pct * 100);

export function evaluarCalidad(entrada: EntradaDelVeredicto): Veredicto {
  const { insumoKg, aceptadoKg, verdeKg, flotesKg } = entrada.masas;
  const maduroPct = pct2(aceptadoKg, insumoKg);
  const verdePct = pct2(verdeKg, insumoKg);
  const flotesPct = pct2(flotesKg, insumoKg);
  const con = (juicio: JuicioDeCalidad, motivo: string | null): Veredicto => ({ juicio, motivo, maduroPct, verdePct, flotesPct });

  // El orden importa: la primera razón que aplica manda, y las tres primeras dicen «no se sabe».
  if (entrada.balanceDescuadrado) {
    return con("BALANCE_DESCUADRADO", "El balance de alguna selección no cuadró: un porcentaje sobre un balance descuadrado no sostiene un juicio.");
  }
  const declaradas = [...new Set(entrada.condiciones.filter((c): c is CondicionDePesaje => c != null))];
  if (declaradas.length > 1) {
    return con("INCOMPARABLE_WEIGHING_CONDITION", `Las selecciones se pesaron en condiciones distintas (${declaradas.join(", ")}): la diferencia sería agua, no calidad.`);
  }
  if (entrada.huboFlotacion && entrada.condiciones.some((c) => c == null)) {
    return con("CONDICION_SIN_DECLARAR", "Hubo flotación y alguna selección no dice cómo se pesó.");
  }
  if (!entrada.limites) {
    return con("NO_ATRIBUIBLE", "El lote no sale de un solo pedido: un pedido podría tapar el incumplimiento del otro.");
  }

  // En gramos enteros y SIN redondear el cociente: 74,996 kg de 100 con un mínimo del 75 % no
  // cumple, y redondeando el porcentaje a dos decimales cumpliría.
  const insumoG = g(insumoKg);
  const fallos: string[] = [];
  const { minMaduroPct, maxVerdePct, maxFlotesPct } = entrada.limites;
  if (minMaduroPct != null && g(aceptadoKg) * 10_000 < insumoG * bp(minMaduroPct)) {
    fallos.push(`maduro ${maduroPct} % < ${minMaduroPct} %`);
  }
  if (maxVerdePct != null && g(verdeKg) * 10_000 > insumoG * bp(maxVerdePct)) {
    fallos.push(`verde ${verdePct} % > ${maxVerdePct} %`);
  }
  if (maxFlotesPct != null && g(flotesKg) * 10_000 > insumoG * bp(maxFlotesPct)) {
    fallos.push(`flotes ${flotesPct} % > ${maxFlotesPct} %`);
  }
  return fallos.length ? con("NO_CUMPLE", fallos.join("; ")) : con("CUMPLE", null);
}
