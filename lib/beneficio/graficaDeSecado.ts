/**
 * La escala de la gráfica de una unidad de secado (diseño §B.3).
 *
 * **Módulo puro, y eso es lo que importa.** No toca la base ni React: recibe los datos y
 * devuelve coordenadas. La escala es donde se esconden los fallos de una gráfica —un solo punto,
 * ningún punto, todos los valores iguales, una división por cero que sale `NaN` y se pinta como
 * una línea en el borde sin que nadie lo note— y todos esos casos se prueban aquí sin base.
 *
 * **`NaN` se ataja ANTES de comparar**, no después: `NaN > x` es `false`, y una comparación con
 * `NaN` siempre halaga la hipótesis de quien la escribió. Por eso `escalar` devuelve `null` y no
 * un número cuando no hay escala posible, y quien lo llama decide qué hacer con la ausencia.
 */

export interface PuntoEnElTiempo {
  readonly cuando: Date;
  readonly valor: number;
}

export interface DatosDeLaGrafica {
  /** Lecturas de humedad del grano. Puntos: son lecturas sueltas y una línea inventaría lo de en medio. */
  readonly humedad: readonly PuntoEnElTiempo[];
  /** El rango objetivo de la receta. Banda: el objetivo es una zona, no una raya. */
  readonly rango: { readonly min: number; readonly max: number } | null;
  /** Temperatura del cuarto. Línea: el ambiente sí es continuo. */
  readonly temperatura: readonly PuntoEnElTiempo[];
  /** Humedad relativa del cuarto. Línea, por lo mismo. */
  readonly humedadRelativa: readonly PuntoEnElTiempo[];
  /** Volteos. Marcas verticales: un gesto, no una medición. */
  readonly volteos: readonly Date[];
  readonly desde: Date;
  readonly hasta: Date;
}

export interface Lienzo {
  readonly ancho: number;
  readonly alto: number;
  readonly margen: { readonly izq: number; readonly der: number; readonly arriba: number; readonly abajo: number };
}

export const LIENZO: Lienzo = { ancho: 720, alto: 260, margen: { izq: 40, der: 16, arriba: 12, abajo: 28 } };

export interface Escala {
  /** `null` cuando no hay nada que escalar: ningún dato, o un instante sin duración. */
  readonly x: ((cuando: Date) => number) | null;
  readonly y: ((valor: number) => number) | null;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * Las dos escalas.
 *
 * **El eje Y es de porcentaje**, y lo comparten la humedad del grano, el rango y la humedad
 * relativa del cuarto porque las tres son `%`. La temperatura NO: va en su propia escala, y por
 * eso se pasa aparte. Mezclar grados y porcentaje en un eje es la forma más barata de dibujar
 * una mentira convincente.
 *
 * **Un rango de cero se ensancha a la fuerza.** Con un único punto, `max - min` es 0 y dividir
 * daría `Infinity`; con `Infinity` la coordenada sale del lienzo y la línea se pinta en el borde
 * como si fuera un dato. Se ensancha un punto arriba y otro abajo, y el punto queda centrado,
 * que es la única lectura honesta de «hay una sola medición».
 */
export function escalasDe(
  datos: Pick<DatosDeLaGrafica, "humedad" | "rango" | "humedadRelativa" | "desde" | "hasta">,
  lienzo: Lienzo = LIENZO,
): Escala {
  const { ancho, alto, margen } = lienzo;
  const anchoUtil = ancho - margen.izq - margen.der;
  const altoUtil = alto - margen.arriba - margen.abajo;

  const t0 = datos.desde.getTime();
  const t1 = datos.hasta.getTime();
  const duracion = t1 - t0;
  const x = duracion > 0 ? (cuando: Date) => margen.izq + ((cuando.getTime() - t0) / duracion) * anchoUtil : null;

  const valores = [
    ...datos.humedad.map((p) => p.valor),
    ...datos.humedadRelativa.map((p) => p.valor),
    ...(datos.rango ? [datos.rango.min, datos.rango.max] : []),
  ].filter((v) => Number.isFinite(v));

  if (valores.length === 0) return { x, y: null, minY: 0, maxY: 0 };

  let minY = Math.min(...valores);
  let maxY = Math.max(...valores);
  if (maxY - minY === 0) {
    minY -= 1;
    maxY += 1;
  }
  const y = (valor: number) => margen.arriba + (1 - (valor - minY) / (maxY - minY)) * altoUtil;
  return { x, y, minY, maxY };
}

/** Una línea SVG, o `null` si no hay con qué dibujarla. Dos puntos son el mínimo de una línea. */
export function caminoDe(
  puntos: readonly PuntoEnElTiempo[],
  escala: Escala,
): string | null {
  if (escala.x === null || escala.y === null || puntos.length < 2) return null;
  const x = escala.x;
  const y = escala.y;
  const partes = puntos
    .filter((p) => Number.isFinite(p.valor))
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.cuando).toFixed(1)} ${y(p.valor).toFixed(1)}`);
  return partes.length < 2 ? null : partes.join(" ");
}
