/**
 * La curva de un lote —pH, Brix o humedad en el tiempo— contra la banda de su receta, pura.
 *
 * **Sin base de datos ni imports a propósito**, igual que `lineaDeEtapas.ts`: recibe lecturas y
 * objetivo ya leídos y devuelve **coordenadas**. No dibuja nada; el `<svg>` lo pinta otra pieza.
 *
 * **La banda sale de un dato, no de un dibujo.** Sin `ProcessTarget` para esa variable, o con uno
 * al que le falta `minValue` o `maxValue` (los tres son anulables en el esquema), no se pinta
 * banda y se dice: `sin_objetivo_declarado`. Una banda a medias —centrada en `targetValue` con
 * un ancho inventado— sería una banda que nadie declaró, y el operario la leería como la receta.
 * Los puntos se devuelven igualmente: «sin banda» no es «sin curva».
 *
 * **En SVG la Y crece hacia ABAJO.** El valor máximo de la escala queda arriba (`y = 0`) y el
 * mínimo abajo (`y = alto`). Con la Y al revés la curva seguiría pareciendo una curva, así que
 * sólo una prueba con números a mano lo ve.
 *
 * **Contra qué se escala el eje Y** (decisión de diseño, no la deduce nadie del tipo):
 * - con banda, contra la banda: `minValue` → `alto`, `maxValue` → `0`. Un valor fuera de la banda
 *   queda fuera del lienzo (`y < 0` o `y > alto`); no se recorta aquí, porque recortar escondería
 *   justo la lectura que se salió de la receta. Qué hacer con eso lo decide quien pinta.
 * - sin banda, contra el mínimo y el máximo de los propios datos: es la única escala disponible.
 *
 * **Los puntos degenerados no dan `NaN`.** Con una sola lectura, o con todas iguales, el rango
 * vale cero y dividir entre él da `NaN` (o `Infinity`). El valor va a **media altura** (`alto / 2`):
 * no hay un extremo que lo ponga arriba o abajo. Con la X pasa igual —una sola lectura, o todas a
 * la misma hora— y va a **media anchura** (`ancho / 2`): un punto suelto en `x = 0` parecería el
 * arranque de una curva que todavía no tiene recorrido, y en el centro se ve que es un dato solo.
 *
 * Las lecturas se ordenan por hora: el orden en que lleguen no debe cambiar la curva.
 *
 * Diseño: `docs/superpowers/specs/2026-09-16-tablero-del-beneficio-design.md`.
 */

export interface PuntoDeCurva {
  readonly x: number;
  readonly y: number;
}

/**
 * `yMin` es la coordenada del **valor** mínimo de la banda (`minValue`) y `yMax` la del valor
 * máximo: por la Y hacia abajo, `yMin >= yMax`. Son coordenadas de valores, no «la menor Y».
 */
export type Banda =
  | {
      readonly tipo: "banda";
      readonly yMin: number;
      readonly yMax: number;
      readonly yObjetivo: number | null;
    }
  | { readonly tipo: "sin_objetivo_declarado" };

export interface Curva {
  readonly puntos: readonly PuntoDeCurva[];
  readonly banda: Banda;
  readonly ancho: number;
  readonly alto: number;
}

/** Posición de `v` entre `min` y `max` en un eje de `tamano`, con el máximo en 0. Rango cero: mitad. */
function escalaY(v: number, min: number, max: number, tamano: number): number {
  if (max === min) return tamano / 2;
  return tamano - ((v - min) / (max - min)) * tamano;
}

export function curvaDeLote(input: {
  readonly lecturas: readonly { readonly occurredAt: Date; readonly value: number }[];
  /** De `ProcessTarget`. Los tres son anulables en el esquema. */
  readonly objetivo: {
    readonly minValue: number | null;
    readonly maxValue: number | null;
    readonly targetValue: number | null;
  } | null;
  readonly ancho: number;
  readonly alto: number;
}): Curva {
  const { ancho, alto, objetivo } = input;
  const lecturas = [...input.lecturas].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  const minValue = objetivo?.minValue ?? null;
  const maxValue = objetivo?.maxValue ?? null;
  const hayBanda = minValue !== null && maxValue !== null;

  const banda = bandaDe(minValue, maxValue, objetivo?.targetValue ?? null, alto);
  if (lecturas.length === 0) return { puntos: [], banda, ancho, alto };

  const valores = lecturas.map((l) => l.value);
  const escalaMin = hayBanda ? minValue : Math.min(...valores);
  const escalaMax = hayBanda ? maxValue : Math.max(...valores);

  const t0 = lecturas[0]!.occurredAt.getTime();
  const t1 = lecturas[lecturas.length - 1]!.occurredAt.getTime();

  const puntos = lecturas.map((l): PuntoDeCurva => ({
    x: t1 === t0 ? ancho / 2 : ((l.occurredAt.getTime() - t0) / (t1 - t0)) * ancho,
    y: escalaY(l.value, escalaMin, escalaMax, alto),
  }));

  return { puntos, banda, ancho, alto };
}

function bandaDe(
  minValue: number | null,
  maxValue: number | null,
  targetValue: number | null,
  alto: number,
): Banda {
  if (minValue === null || maxValue === null) return { tipo: "sin_objetivo_declarado" };
  return {
    tipo: "banda",
    yMin: escalaY(minValue, minValue, maxValue, alto),
    yMax: escalaY(maxValue, minValue, maxValue, alto),
    yObjetivo: targetValue === null ? null : escalaY(targetValue, minValue, maxValue, alto),
  };
}
