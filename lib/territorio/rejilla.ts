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

/**
 * Cuántas celdas comparte un rango nuevo con **un conjunto** de rangos.
 *
 * **No es la suma de `celdasEnComun`, y confundirlas fue un defecto real.**
 * Medido el 2026-10-02 por una revisión independiente: un bloque vecino con los
 * rangos `1–5` y `4–8` de las mismas plantas, contra un rango nuevo `1–5`,
 * informaba **70 celdas compartidas donde hay 50** — sumaba dos intersecciones
 * que se pisan entre sí. Un número inflado en un aviso es peor que ningún aviso:
 * el agronómo decide sobre él.
 *
 * Y la razón por la que no se vio: **con un vecino de un solo rango, la suma y la
 * unión coinciden**, que es lo que todas las pruebas tenían. Nada impide hoy que
 * los rangos de un mismo bloque se solapen entre sí.
 *
 * Se cuenta por compresión de coordenadas: se parten las hileras en bandas por
 * los bordes de todos los trozos, y en cada banda se mide la unión de los
 * intervalos de plantas. Exacto, y sin recorrer celda por celda — una rejilla
 * grande tiene millones y esto corre al leer una pantalla.
 */
export function celdasEnComunConVarios(rangos: readonly Rango[], otro: Rango): number {
  const trozos = rangos
    .filter((r) => seSolapan(r, otro))
    .map((r) => ({
      rowFrom: Math.max(r.rowFrom, otro.rowFrom),
      rowTo: Math.min(r.rowTo, otro.rowTo),
      plantFrom: Math.max(r.plantFrom, otro.plantFrom),
      plantTo: Math.min(r.plantTo, otro.plantTo),
    }));
  if (trozos.length === 0) return 0;

  const bordes = [...new Set(trozos.flatMap((t) => [t.rowFrom, t.rowTo + 1]))].sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < bordes.length - 1; i += 1) {
    const desde = bordes[i]!;
    const hasta = bordes[i + 1]! - 1;
    const alto = hasta - desde + 1;
    if (alto <= 0) continue;
    const intervalos = trozos
      .filter((t) => t.rowFrom <= desde && t.rowTo >= hasta)
      .map((t) => [t.plantFrom, t.plantTo] as const)
      .sort((a, b) => a[0] - b[0]);
    let cubiertas = 0;
    let finAnterior = -Infinity;
    for (const [a, b] of intervalos) {
      const desdeReal = Math.max(a, finAnterior + 1);
      if (b >= desdeReal) {
        cubiertas += b - desdeReal + 1;
        finAnterior = b;
      }
    }
    total += alto * cubiertas;
  }
  return total;
}
