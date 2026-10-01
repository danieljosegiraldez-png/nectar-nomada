/**
 * La aritmética de la rejilla de una parcela.
 *
 * Diseño: `docs/superpowers/specs/2026-10-01-rejilla-y-bloques-design.md` §4,
 * decisiones **D3** (una sola numeración, la de la parcela) y **D5** (un bloque
 * tiene uno o varios rangos).
 *
 * **Módulo puro: no importa Prisma ni nada del dominio.** La aritmética de
 * celdas no es trazabilidad, y tenerla aparte es lo que permite probar sin base
 * los cuatro estados en que una rejilla miente — el rango a medias, el
 * invertido, el que no describe una celda y el que no cabe.
 *
 * **`NaN` se ataja ANTES de comparar**, y eso no es cautela de más: `NaN > x` es
 * `false`, así que un rango con `NaN` pasaría cualquier comprobación de límites
 * y se guardaría como válido. Una revisión independiente encontró exactamente
 * eso en una versión anterior de esta función, que devolvía «válido» para cuatro
 * `NaN`. Una comparación con `NaN` siempre halaga a quien la escribió.
 */

export interface Rejilla {
  readonly rowCount: number;
  readonly plantsPerRow: number;
}

export interface Rango {
  readonly rowFrom: number;
  readonly rowTo: number;
  readonly plantFrom: number;
  readonly plantTo: number;
}

/**
 * Por qué un rango no vale, y son cuatro hechos distintos a propósito: una
 * pantalla tiene que poder decir con cuál se topó. Colapsarlos en `null` sería
 * «no hay datos», que es otra cosa.
 *
 * `no_es_celda` cubre `NaN`, infinito, los fraccionarios y el cero o los
 * negativos: las hileras se cuentan desde 1, así que la hilera 0 no es una celda
 * de ninguna rejilla — no una celda que se salga de ésta.
 */
export type RangoInvalido = "a_medias" | "al_reves" | "no_es_celda" | "fuera_de_rejilla";

const esCoordenada = (n: number) => Number.isInteger(n) && n >= 1;

/**
 * `null` cuando el rango es válido **o cuando no hay rango ninguno** — los cuatro
 * campos vacíos son un estado legítimo, porque el rango de la microparcela es
 * opcional (D3). Media declaración, en cambio, es `a_medias`: si las dos
 * situaciones devolvieran lo mismo, «opcional» acabaría significando «cualquier
 * cosa».
 */
export function validarRango(r: Partial<Rango>, dentro: Rejilla | null): RangoInvalido | null {
  const dados = [r.rowFrom, r.rowTo, r.plantFrom, r.plantTo].filter((v) => v !== undefined && v !== null);
  if (dados.length === 0) return null;
  if (dados.length !== 4) return "a_medias";

  const { rowFrom, rowTo, plantFrom, plantTo } = r as Rango;
  if (![rowFrom, rowTo, plantFrom, plantTo].every(esCoordenada)) return "no_es_celda";
  if (rowFrom > rowTo || plantFrom > plantTo) return "al_reves";

  // Sin rejilla no hay nada en lo que quepa un rango. No es «no hay datos»: es
  // que la pregunta no se puede contestar hasta que la parcela se numere.
  if (dentro === null) return "fuera_de_rejilla";
  if (rowTo > dentro.rowCount || plantTo > dentro.plantsPerRow) return "fuera_de_rejilla";
  return null;
}

/** Celdas del rango, con los dos extremos incluidos: de la hilera 3 a la 6 son cuatro hileras. */
export function celdasDelRango(r: Rango): number {
  return (r.rowTo - r.rowFrom + 1) * (r.plantTo - r.plantFrom + 1);
}

/**
 * Dos rangos se solapan **sólo si se solapan sus dos dimensiones**. La misma
 * banda de hileras con plantas disjuntas NO es solape: son dos trozos distintos
 * de las mismas hileras, y un detector que mirara una sola dimensión rechazaría
 * bloques legítimos — peor que no tener detector, porque enseña a ignorarlo.
 */
export function seSolapan(a: Rango, b: Rango): boolean {
  return a.rowFrom <= b.rowTo && b.rowFrom <= a.rowTo && a.plantFrom <= b.plantTo && b.plantFrom <= a.plantTo;
}

/** Cuántas celdas comparten, y 0 cuando no se tocan. */
export function celdasEnComun(a: Rango, b: Rango): number {
  if (!seSolapan(a, b)) return 0;
  const hileras = Math.min(a.rowTo, b.rowTo) - Math.max(a.rowFrom, b.rowFrom) + 1;
  const plantas = Math.min(a.plantTo, b.plantTo) - Math.max(a.plantFrom, b.plantFrom) + 1;
  return hileras * plantas;
}
