/**
 * Cuándo se libera la próxima unidad (tanque o cama), pura y sin base de datos.
 *
 * Es la segunda mitad de la pieza de ocupación: `tablero.ts` dice cuántas unidades hay libres y
 * cuántas en uso; esto dice **cuándo vuelve a haber una**. Igual que allí, recibe los datos ya
 * leídos y su prueba es hermética.
 *
 * **Son tres casos y ninguno se parece a otro:**
 * - hay corridas y alguna declara `expectedHours` → `a_las`, con la que se libera ANTES;
 * - hay corridas y NINGUNA lo declara → `sin_duracion_declarada`;
 * - no hay corridas → `null`.
 *
 * **`null` y `sin_duracion_declarada` no son lo mismo**, y confundirlos es el fallo que este
 * módulo existe para impedir: «no hay nada ocupado» no es «hay algo y no sé cuándo acaba». Un
 * operario que lee «sin duración declarada» sabe que hay una unidad en uso que la receta no
 * fecha; uno que no lee nada entiende que todo está libre.
 *
 * **Nunca una hora inventada** (diseño del tablero): si la receta no declara duración, no se
 * suma una por defecto ni se devuelve `ahora`. Una hora falsa se lee como un dato.
 *
 * **Una corrida sin duración no tapa a las que sí la declaran**: entre una muda y una que habla,
 * gana la que habla, porque es la próxima que se SABE. Que hay otras corridas sin fecha ya lo
 * cuenta la ocupación en la pantalla; esta función sólo responde «la próxima conocida».
 *
 * `cuando` puede caer antes de `ahora` si la corrida ya debería haber terminado y sigue abierta.
 * No se recorta a `ahora`: decir «ya debería estar libre» es información, y moverla a «ahora»
 * sería inventar una hora. `ahora` se recibe porque la firma del encargo lo pide y **hoy no se
 * usa**: la función no lee el reloj y no devuelve `ahora`, y la decisión de no recortar es lo
 * que lo hace prescindible.
 */

export type Liberacion =
  | { readonly tipo: "a_las"; readonly cuando: Date }
  | { readonly tipo: "sin_duracion_declarada" };

export interface CorridaConDuracion {
  readonly equipmentId: string | null;
  readonly bedLocationId: string | null;
  readonly iniciadaEn: Date;
  /**
   * De la versión de receta de su `LotProcess`. `null` = la receta no lo declara. Un valor que no es
   * una duración (no finito, cero o negativo) cuenta como no declarado: ver `proximaLiberacion`.
   */
  readonly expectedHours: number | null;
}

const MS_POR_HORA = 3_600_000;

/** La PRÓXIMA en liberarse, o `null` si no hay ninguna corrida abierta. */
export function proximaLiberacion(input: {
  readonly corridas: readonly CorridaConDuracion[];
  readonly ahora: Date;
}): Liberacion | null {
  if (input.corridas.length === 0) return null;

  let proxima: number | null = null;
  for (const c of input.corridas) {
    // `null`, no-finito (NaN, Infinity) y no positivo (0, negativo) cuentan igual: no declarada.
    // NaN daría una fecha inválida que se pintaría como hora; 0 o un negativo darían el INICIO de
    // la corrida, o una hora anterior a él, y se leería como «ya debía liberarse» de una duración
    // que ninguna receta puede declarar. **Es la misma regla de los otros dos consumidores**: la
    // escritura la rechaza (`validateExpectedHours`, `processTargets.ts`: `expected_hours_must_be_positive`)
    // y la cola la declara inválida (`estadoDeRitmo`, `ritmo.ts`: `duracion_esperada_invalida_en_la_base`).
    // Aquí no se lanza —la base puede traerlo corrupto y la pantalla no debe caer—, pero tampoco se
    // trata como duración: en la misma pantalla la cola diría «inválida» y esta línea la citaría.
    if (c.expectedHours === null || !Number.isFinite(c.expectedHours) || c.expectedHours <= 0) continue;
    const fin = c.iniciadaEn.getTime() + c.expectedHours * MS_POR_HORA;
    if (proxima === null || fin < proxima) proxima = fin;
  }

  return proxima === null
    ? { tipo: "sin_duracion_declarada" }
    : { tipo: "a_las", cuando: new Date(proxima) };
}
