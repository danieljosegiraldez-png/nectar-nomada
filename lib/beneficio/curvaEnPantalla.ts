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
import { indiceDeLaUnicaEnElExtremo, type AlcanceDeLaBanda, type Curva, type PuntoDeCurva } from "./curvaDeLote";

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
  /**
   * La confianza de la lectura, tal cual viene del punto de la curva. Viaja hasta aquí porque la
   * pantalla marca el punto cuyo instrumento no está verificado: se dibuja —el registro es
   * autoritativo— y no sostiene ninguna afirmación (`PENDING_IMPLEMENTATIONS/021`).
   */
  readonly confianza?: PuntoDeCurva["confianza"];
}

/**
 * **A cuántas lecturas alcanza la banda**, que lo decide el momento del objetivo y nada más.
 *
 * `trayectoria` (un objetivo `during`) juzga todas. Un objetivo `initial` o `final` es un evento de
 * un instante y juzga **una**: la que `indiceDeLaUnicaEnElExtremo` identifica, que se niega a
 * desempatar. Un empate de instante da `ninguna` — no «todas dentro» ni una elegida al azar.
 *
 * Es el defecto de `PENDING_IMPLEMENTATIONS/017`: antes toda banda juzgaba toda lectura, así que
 * una meta FINAL convertía un descenso de pH por diseño en «2 lecturas fuera del rango».
 */
export type AQuienJuzgaLaBanda =
  | { readonly tipo: "todas" }
  | { readonly tipo: "una"; readonly indice: number }
  | { readonly tipo: "ninguna"; readonly alcance: "al_inicio" | "al_final" };

export function aQuienJuzgaLaBanda(curva: Curva, alcance: AlcanceDeLaBanda): AQuienJuzgaLaBanda {
  if (alcance === "trayectoria") return { tipo: "todas" };
  const extremo = alcance === "al_inicio" ? "primera" : "ultima";
  const indice = indiceDeLaUnicaEnElExtremo(curva.lecturas, extremo);
  return indice === null ? { tipo: "ninguna", alcance } : { tipo: "una", indice };
}

export function colocarPuntos(curva: Curva, margen: number = margenVertical(curva.alto)): PuntoColocado[] {
  const banda = curva.banda;
  // Los extremos se ordenan en vez de suponer `yMin >= yMax`. Una receta al revés (min > max) ya no
  // llega aquí como banda: `curvaDeLote` la devuelve como `banda_al_reves` y no se juzga.
  const arriba = banda.tipo === "banda" ? Math.min(banda.yMin, banda.yMax) : null;
  const abajo = banda.tipo === "banda" ? Math.max(banda.yMin, banda.yMax) : null;
  const aQuien = banda.tipo === "banda" ? aQuienJuzgaLaBanda(curva, banda.alcance) : null;

  return curva.puntos.map((p, i): PuntoColocado => {
    const tope = -margen;
    const piso = curva.alto + margen;
    const fuera = p.y < tope ? "arriba" : p.y > piso ? "abajo" : null;
    // Una lectura a la que la banda no alcanza es `null`, no `false`: `false` diría «dentro» de un
    // rango que no la mira. Es la misma distinción que ya se hacía sin banda, por el otro motivo.
    const laJuzga = aQuien !== null && (aQuien.tipo === "todas" || (aQuien.tipo === "una" && aQuien.indice === i));
    return {
      x: p.x,
      y: fuera === "arriba" ? tope : fuera === "abajo" ? piso : p.y,
      // Sin banda (también al revés o de ancho cero: no se dibuja ni se escala contra ella) no hay con
      // qué juzgar: `null`, no `false`. `false` diría «dentro» de un rango que no distingue nada.
      fueraDeBanda: arriba === null || abajo === null || !laJuzga ? null : p.y < arriba || p.y > abajo,
      fuera,
      confianza: p.confianza,
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
 * - `banda_de_ancho_cero` (`minValue == maxValue`): `curvaDeLote` ya no escala contra ella (los
 *   puntos van contra sus propios datos, como sin banda) y no la dibuja. Antes escalaba `max ===
 *   min` a media altura para TODO valor y `colocarPuntos` juzgaba en espacio-y, así que una lectura
 *   de 9,9 contra 4,5 «caía dentro». Con ese ancho **no se puede decir** qué lecturas quedan
 *   fuera, y callarlo (o decir «todas dentro») escondería justo la que se salió.
 * - `sin_lecturas`: con cero lecturas no se afirma nada sobre el rango; un cero leído como «bien»
 *   es la forma que este módulo existe para impedir.
 * - `juzgada`: sólo aquí hay una cuenta, y sólo aquí cabe «todas dentro» (cuando `fuera` es 0).
 *
 * - `banda_al_reves` (`minValue > maxValue`): una receta mal cargada. `curvaDeLote` ya no escala
 *   contra ella —la banda saldría idéntica a la de una correcta y los puntos, espejados—, así que
 *   no hay banda ni «fuera de banda» que contar. No se afirma nada y se dice por qué.
 *
 * Una banda al revés NO es ancho cero (sus extremos son distintos) ni se juzga ordenada: se
 * niega, porque «ordenarla» sería decidir en silencio cuál de los dos números era el error.
 */
export type JuicioDeBanda =
  | { readonly tipo: "sin_banda" }
  | { readonly tipo: "banda_de_ancho_cero" }
  | { readonly tipo: "banda_al_reves" }
  | { readonly tipo: "sin_lecturas" }
  /**
   * El objetivo es de un instante (`initial` o `final`) y **varias lecturas comparten ese
   * instante**, así que no se puede decir cuál es. No se desempata: ver `ultimaLectura`, y los
   * 7 de 10 lotes reales que lo motivaron.
   */
  | { readonly tipo: "extremo_ambiguo"; readonly alcance: "al_inicio" | "al_final" }
  /**
   * `total` es **cuántas lecturas juzgó esta banda**, no cuántas hay. Con un objetivo `during`
   * coinciden; con uno de un instante, `total` es 1 y las demás lecturas siguen dibujadas sin
   * juicio. Decir «0 de 3 fuera» cuando sólo se mira una sería contar lo que no se midió.
   */
  | { readonly tipo: "juzgada"; readonly alcance: AlcanceDeLaBanda; readonly fuera: number; readonly total: number };

export function juicioDeBanda(curva: Curva, puntos: readonly PuntoColocado[]): JuicioDeBanda {
  const banda = curva.banda;
  if (banda.tipo === "banda_al_reves") return { tipo: "banda_al_reves" };
  if (banda.tipo === "banda_de_ancho_cero") return { tipo: "banda_de_ancho_cero" };
  if (banda.tipo !== "banda") return { tipo: "sin_banda" };
  if (puntos.length === 0) return { tipo: "sin_lecturas" };
  const aQuien = aQuienJuzgaLaBanda(curva, banda.alcance);
  if (aQuien.tipo === "ninguna") return { tipo: "extremo_ambiguo", alcance: aQuien.alcance };
  const juzgadas = puntos.filter((p) => p.fueraDeBanda !== null);
  return {
    tipo: "juzgada",
    alcance: banda.alcance,
    fuera: juzgadas.filter((p) => p.fueraDeBanda === true).length,
    total: juzgadas.length,
  };
}
