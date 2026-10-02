/**
 * Las marcas de los dos ejes de la curva de un lote, puras.
 *
 * **Sin base de datos ni imports a propósito**, igual que `curvaDeLote.ts`: recibe lecturas y
 * banda ya leídas y devuelve **posiciones con su texto**. No dibuja nada; el `<svg>` lo pinta otra
 * pieza. La curva sola no dice a qué pH está la banda ni cuánto lleva la fase: estas marcas sí.
 *
 * **La escala Y está REPETIDA, no importada.** `escalaY` de abajo es la de `curvaDeLote` letra por
 * letra: dos módulos puros no se acoplan, y un cambio de escala allí no debe romper los ejes en
 * silencio. Que las dos coinciden lo prueba `pantalla-del-tablero.test.ts`, no este archivo. En SVG la
 * Y crece hacia ABAJO: el máximo queda arriba (`pos = 0`) y el mínimo abajo (`pos = alto`).
 *
 * **De qué se rotula el eje Y** (la misma decisión que toma la curva, o los números no casarían):
 * - con banda, de la banda: máximo, centro y mínimo. Es lo que hace útil la gráfica.
 * - sin banda, de los datos. Una banda al revés (`min > max`) o de ancho cero (`min === max`) cuenta
 *   como sin banda, porque `curvaDeLote` tampoco escala contra ella.
 * - rango cero —una sola lectura, o todas iguales—: **una sola marca**, a media altura, como la
 *   curva. Tres marcas con el mismo texto no dirían nada, y dividir entre cero daría `NaN`.
 *
 * **El eje X cuenta HORAS desde la primera lectura, no fechas:** es la curva de una fase, y lo que
 * importa es cuánto lleva. Dos marcas, el arranque y el final. Con una sola lectura, o todas a la
 * misma hora, una sola marca (`0 h`) a media anchura: donde la curva pone ese punto.
 *
 * El orden en que lleguen las lecturas no cambia los ejes. Sin lecturas no hay marcas de datos.
 *
 * Diseño: `docs/superpowers/specs/2026-09-16-tablero-del-beneficio-design.md` §4.5.
 */

export interface Marca {
  readonly pos: number;
  readonly texto: string;
}

export interface Ejes {
  readonly x: readonly Marca[];
  readonly y: readonly Marca[];
}

/** Posición de `v` entre `min` y `max` en un eje de `tamano`, con el máximo en 0. Rango cero: mitad. */
function escalaY(v: number, min: number, max: number, tamano: number): number {
  if (max === min) return tamano / 2;
  return tamano - ((v - min) / (max - min)) * tamano;
}

/** Hasta dos decimales y como mínimo uno: `4.0`, `4.3`, `4.05`. Un extremo de banda no se redondea. */
function textoDeValor(v: number): string {
  const dos = (Math.round(v * 100) / 100).toFixed(2);
  return dos.endsWith("0") ? Number(dos).toFixed(1) : dos;
}

/** Horas con un decimal como mucho, sin el `.0`: `8 h`, `7.5 h`. */
function textoDeHoras(ms: number): string {
  return `${Math.round((ms / 3_600_000) * 10) / 10} h`;
}

export function ejesDeLaCurva(input: {
  readonly lecturas: readonly { readonly occurredAt: Date; readonly value: number }[];
  readonly banda: { readonly min: number; readonly max: number } | null;
  readonly ancho: number;
  readonly alto: number;
}): Ejes {
  const { lecturas, banda, ancho, alto } = input;

  const valores = lecturas.map((l) => l.value);
  const tiempos = lecturas.map((l) => l.occurredAt.getTime());

  const hayBanda = banda !== null && banda.min < banda.max;
  const hayEscala = hayBanda || lecturas.length > 0;
  const min = hayBanda ? banda.min : Math.min(...valores);
  const max = hayBanda ? banda.max : Math.max(...valores);

  // Rango cero: un solo valor, una sola marca. `escalaY` ya lo manda a media altura.
  const valoresDelEje = !hayEscala ? [] : max === min ? [min] : [max, (min + max) / 2, min];
  const y = valoresDelEje.map((v): Marca => ({
    pos: escalaY(v, min, max, alto),
    texto: textoDeValor(v),
  }));

  const t0 = Math.min(...tiempos);
  const t1 = Math.max(...tiempos);
  const x: Marca[] =
    lecturas.length === 0
      ? []
      : t1 === t0
        ? [{ pos: ancho / 2, texto: "0 h" }]
        : [
            { pos: 0, texto: "0 h" },
            { pos: ancho, texto: textoDeHoras(t1 - t0) },
          ];

  return { x, y };
}
