/**
 * La densidad de un lote, por **marco de plantación**.
 *
 * **Por qué no sale de `areaHectares`** (D10, decisión de Daniel el 2026-10-02): «la
 * densidad se coloca por mts entre cada plantón, y hay tantos plantones». En un lote
 * irregular el área del polígono incluye la roca y el camino, así que la densidad real
 * saldría baja por una razón que no es agronómica. El área plantada se deriva de la
 * rejilla —celdas × el marco—: sin topografía, y correcta en un lote irregular.
 *
 * Tres cifras, cada una con su procedencia dicha:
 *
 * | cifra | de dónde sale | qué contesta |
 * |---|---|---|
 * | **diseñada** | `10.000 / (plantSpacing × rowSpacing)` | a qué densidad se sembró |
 * | **área plantada** | celdas de la forma × el marco | cuánto terreno hay bajo planta |
 * | **real** | plantas contadas ÷ esa área | qué hay en pie |
 *
 * **La diferencia entre la diseñada y la real es señal agronómica** —plantas que faltan
 * o que se murieron—, no un error de cuadratura.
 *
 * **Ningún estado devuelve cero por un dato ausente.** «Nunca registrado» no es
 * «registrado como cero» (ADR-080), y una densidad es una división: un cero en el
 * denominador no es una densidad infinita, es que falta el dato.
 *
 * **No sustituye a `computePlotDensity` todavía.** Entra al lado; sus dos consumidores
 * de producción —`plantingCohorts.ts` y `pendienteDeLaParcela.ts`— se migran uno a uno
 * con su prueba, y la vieja se retira cuando no quede ninguno.
 */
export interface Marco {
  readonly plantSpacingMeters: number | null;
  readonly rowSpacingMeters: number | null;
}

export type DensidadDelLote =
  /** Sin los dos metros no hay NINGUNA cifra, ni la diseñada. */
  | { status: "sin_marco" }
  /** Hay marco, así que la diseñada sí; sin forma no hay área ni real. */
  | { status: "sin_forma"; disenada: number }
  | { status: "conteo_incompleto"; disenada: number; celdas: number; cohortesSinConteo: number }
  | {
      status: "ok";
      disenada: number;
      celdas: number;
      areaHectareas: number;
      real: number;
      plantasContadas: number;
    };

/**
 * Los dos metros, o `null` si falta uno o no es positivo.
 *
 * **`Number.isFinite` va PRIMERO, antes de comparar.** Un `NaN` compara falso contra
 * todo, así que `NaN <= 0` es `false` y pasaría por válido — y un `NaN` en el
 * denominador da `Infinity`, que es el número que más convence sin medir nada.
 */
function metrosValidos(m: Marco): readonly [number, number] | null {
  const { plantSpacingMeters: p, rowSpacingMeters: h } = m;
  if (p == null || h == null) return null;
  if (!Number.isFinite(p) || !Number.isFinite(h)) return null;
  if (p <= 0 || h <= 0) return null;
  return [p, h];
}

/** Plantas por hectárea que el marco implica. `null` si falta o no es positivo un metro. */
export function densidadDisenada(marco: Marco): number | null {
  const m = metrosValidos(marco);
  if (!m) return null;
  return Math.round(10000 / (m[0] * m[1]));
}

/** Hectáreas bajo planta, derivadas de la rejilla. `null` sin celdas o sin marco. */
export function areaPlantadaHectareas(celdas: number, marco: Marco): number | null {
  const m = metrosValidos(marco);
  if (!m || celdas <= 0) return null;
  return (celdas * m[0] * m[1]) / 10000;
}

export function densidadDelLote(entrada: {
  readonly marco: Marco;
  /** Celdas que la forma declarada dice que están plantadas. 0 = forma sin declarar. */
  readonly celdasPlantadas: number;
  readonly plantasContadas: number;
  readonly cohortesSinConteo: number;
}): DensidadDelLote {
  // **El orden de los estados no es libre.** Sin marco gana sobre sin forma: sin los dos
  // metros no hay ni diseñada, así que decir `sin_forma` ahí prometería una cifra que no
  // existe.
  const disenada = densidadDisenada(entrada.marco);
  if (disenada == null) return { status: "sin_marco" };
  if (entrada.celdasPlantadas <= 0) return { status: "sin_forma", disenada };
  if (entrada.cohortesSinConteo > 0) {
    return {
      status: "conteo_incompleto",
      disenada,
      celdas: entrada.celdasPlantadas,
      cohortesSinConteo: entrada.cohortesSinConteo,
    };
  }
  // No puede ser null aquí: hay marco válido y celdas > 0, que son sus dos condiciones.
  const areaHectareas = areaPlantadaHectareas(entrada.celdasPlantadas, entrada.marco)!;
  return {
    status: "ok",
    disenada,
    celdas: entrada.celdasPlantadas,
    areaHectareas,
    real: entrada.plantasContadas / areaHectareas,
    plantasContadas: entrada.plantasContadas,
  };
}

/**
 * La frase que pinta la ficha para cada estado de la densidad, y los números que lleva.
 *
 * **Devuelve la clave y los parámetros; no renderiza nada.** Es el mismo patrón que
 * `claveDeLaComparacion`, y existe por el mismo motivo: así se puede probar sin montar un
 * navegador — este repositorio no tiene infraestructura para renderizar componentes y sus
 * guardias de pantalla leen la fuente.
 *
 * **Cada estado pasa sólo los números que su frase puede afirmar.** `conteo_incompleto`
 * no lleva `real`, porque una densidad calculada sobre un conteo incompleto es un número
 * que parece cierto; si llegara a la plantilla, un descuido de redacción lo pintaría.
 */
export function claveDeLaDensidad(d: DensidadDelLote): {
  clave: "densidadSinMarco" | "densidadSinForma" | "densidadConteoIncompleto" | "densidadComparada";
  params: Record<string, number>;
} {
  switch (d.status) {
    case "sin_marco":
      // Sin los dos metros no hay ninguna cifra, ni la diseñada.
      return { clave: "densidadSinMarco", params: {} };
    case "sin_forma":
      // El marco da la diseñada sin necesitar la forma; la real y el área sí la
      // necesitan, y pasarlas aquí sería inventarlas.
      return { clave: "densidadSinForma", params: { disenada: d.disenada } };
    case "conteo_incompleto":
      return {
        clave: "densidadConteoIncompleto",
        params: { disenada: d.disenada, sinContar: d.cohortesSinConteo },
      };
    case "ok":
      return {
        clave: "densidadComparada",
        // **Se redondea, no se trunca.** Un truncado sesga la cifra siempre hacia abajo,
        // y 1.894,6 plantas/ha no es una medición: es una división.
        params: { disenada: d.disenada, real: Math.round(d.real), hectareas: d.areaHectareas },
      };
  }
}
