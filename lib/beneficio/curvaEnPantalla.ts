/**
 * Lo que la pantalla necesita de la curva y `curvaDeLote` no da: dónde pintar cada punto sin
 * esconder los que se salieron de la receta, y qué curva pidió la URL.
 *
 * **Puro y sin base de datos**, igual que `curvaDeLote.ts`: así se prueba con entradas que
 * ninguna base produce (una lectura 50 veces por encima de la banda) y no hace falta un
 * navegador para saber que el dato importante no se recorta.
 *
 * **Por qué existe `colocarPuntos`.** `curvaDeLote` NO recorta los puntos al lienzo, a
 * propósito: una lectura fuera de la banda queda con `y < 0` o `y > alto`, porque recortarla
 * escondería justo la que se salió de la receta, que es la más importante. Eso traspasa una
 * obligación a quien pinta: **el `<svg>` tiene que mostrarlos.** Un `<svg>` sin más recorta a su
 * `viewBox`, y el trabajo de aquella tarea se perdería en la última pulgada.
 *
 * La decisión, en dos capas (el porqué en `CurvaDeLote.tsx`):
 * 1. el `viewBox` se amplía con un margen vertical (`margenVertical`), así que una lectura
 *    razonablemente fuera de la banda se dibuja **en su sitio verdadero**;
 * 2. una lectura tan lejos que no cabe ni en el margen se **ancla en el borde** y se marca
 *    `fuera: "arriba" | "abajo"` — se enseña, con un símbolo propio y contada en texto, no se
 *    recorta en silencio. Sin esta capa, un valor 50 veces mayor pintaría por encima del resto de
 *    la página o se saldría del dibujo sin dejar rastro.
 */
import type { Curva } from "./curvaDeLote";

/** El lienzo en que se pide la curva. El `viewBox` real lo amplía `margenVertical`. */
export const LIENZO_DE_CURVA = { ancho: 480, alto: 200 } as const;

/**
 * Cuánto del alto se añade arriba y abajo para que quepan las lecturas fuera de la banda.
 *
 * **La mitad del alto, y no menos: medido en el navegador.** Con el 20 % una banda de pH 4,0–4,6
 * dejaba fuera del margen una lectura de 4,9 —media banda por encima, una desviación corriente— y
 * la anclaba en el borde en vez de dibujarla donde está. La banda ocupa TODO el alto del lienzo
 * (`curvaDeLote` escala `minValue → alto`, `maxValue → 0`), así que una lectura a media banda de
 * distancia cae a medio alto. Con el 50 % se dibujan en su sitio verdadero las que se pasan hasta
 * media banda por cada lado; el resto se ancla y se marca.
 */
export function margenVertical(alto: number): number {
  return alto * 0.5;
}

export interface PuntoColocado {
  readonly x: number;
  /** Dónde se pinta. Igual a la `y` de la curva salvo que `fuera` no sea `null`. */
  readonly y: number;
  /** `true` si la `y` de la curva queda fuera de la banda. `null` = no hay banda que juzgar. */
  readonly fueraDeBanda: boolean | null;
  /** Anclado al borde porque no cabe ni en el margen: se marca, no se esconde. */
  readonly fuera: "arriba" | "abajo" | null;
}

export function colocarPuntos(curva: Curva, margen: number = margenVertical(curva.alto)): PuntoColocado[] {
  const banda = curva.banda;
  // `yMin >= yMax` salvo que la receta venga al revés (min > max): se juzga con los dos
  // extremos ordenados, no con la suposición.
  const arriba = banda.tipo === "banda" ? Math.min(banda.yMin, banda.yMax) : null;
  const abajo = banda.tipo === "banda" ? Math.max(banda.yMin, banda.yMax) : null;

  return curva.puntos.map((p): PuntoColocado => {
    const tope = -margen;
    const piso = curva.alto + margen;
    const fuera = p.y < tope ? "arriba" : p.y > piso ? "abajo" : null;
    return {
      x: p.x,
      y: fuera === "arriba" ? tope : fuera === "abajo" ? piso : p.y,
      // Sin banda, o con una de ancho cero (`escalaY` manda TODO valor a media altura), no hay con
      // qué juzgar: `null`, no `false`. `false` diría «dentro» de un rango que no distingue nada.
      fueraDeBanda: arriba === null || abajo === null || arriba === abajo ? null : p.y < arriba || p.y > abajo,
      fuera,
    };
  });
}

/** Las variables que la pantalla sabe dibujar, con su nombre en `Measurement.variable`. */
export const VARIABLES_DE_CURVA = ["ph", "brix", "moisture"] as const;
export type VariableDeCurva = (typeof VARIABLES_DE_CURVA)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La curva que pide la URL (`?lote=<id>&variable=ph`), o `null` si no pide ninguna.
 *
 * **Valida antes de que nada llegue a la base**: `Lot.id` es `@db.Uuid`, y Postgres rechaza con
 * error —no con «no encontrado»— una cadena que no lo es. Una URL escrita a mano no debe poder
 * tumbar la página. Un parámetro repetido (`?lote=a&lote=b`) llega como arreglo y se ignora: no se
 * adivina cuál valía. Una variable desconocida cae en `ph`, que es la primera de la lista.
 */
export function leerCurvaPedida(params: {
  readonly lote?: string | string[];
  readonly variable?: string | string[];
}): { readonly lotId: string; readonly variable: VariableDeCurva } | null {
  const { lote, variable } = params;
  if (typeof lote !== "string" || !UUID.test(lote)) return null;
  const v = VARIABLES_DE_CURVA.find((x) => x === variable) ?? VARIABLES_DE_CURVA[0];
  return { lotId: lote.toLowerCase(), variable: v };
}

/**
 * Qué puede afirmar la pantalla sobre las lecturas y la banda. **Una sola función decide, para
 * que nadie escriba «todas dentro» donde no se midió nada.**
 *
 * - `sin_banda`: la receta no declara rango; no se juzga ninguna lectura.
 * - `banda_de_ancho_cero` (`minValue == maxValue`): `curvaDeLote` escala `max === min` a media
 *   altura para TODO valor (no hay rango que dividir), y `colocarPuntos` juzga en espacio-y, así
 *   que una lectura de 9,9 contra 4,5 «cae dentro». Con ese ancho **no se puede decir** qué
 *   lecturas quedan fuera, y callarlo (o decir «todas dentro») escondería justo la que se salió.
 * - `sin_lecturas`: con cero lecturas no se afirma nada sobre el rango; un cero leído como «bien»
 *   es la forma que este módulo existe para impedir.
 * - `juzgada`: sólo aquí hay una cuenta, y sólo aquí cabe «todas dentro» (cuando `fuera` es 0).
 *
 * Una banda al revés (min > max) NO es ancho cero: tiene extremos distintos y se juzga ordenada.
 */
export type JuicioDeBanda =
  | { readonly tipo: "sin_banda" }
  | { readonly tipo: "banda_de_ancho_cero" }
  | { readonly tipo: "sin_lecturas" }
  | { readonly tipo: "juzgada"; readonly fuera: number; readonly total: number };

export function juicioDeBanda(curva: Curva, puntos: readonly PuntoColocado[]): JuicioDeBanda {
  const banda = curva.banda;
  if (banda.tipo !== "banda") return { tipo: "sin_banda" };
  if (banda.yMin === banda.yMax) return { tipo: "banda_de_ancho_cero" };
  if (puntos.length === 0) return { tipo: "sin_lecturas" };
  return { tipo: "juzgada", fuera: puntos.filter((p) => p.fueraDeBanda === true).length, total: puntos.length };
}
