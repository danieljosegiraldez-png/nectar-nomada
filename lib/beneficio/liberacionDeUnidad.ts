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

import { clasificar, type HechosDelEquipo } from "../equipos/disponibilidad";

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

/**
 * La unidad tal como esta función la necesita: su id y lo que puede impedir que vuelva a estar
 * libre. Es `HechosDelEquipo` sin `enUso` —el mismo tipo que usa el mapa del tablero— para que no
 * haya dos definiciones de «qué se sabe de una unidad» que puedan derivar.
 */
export type UnidadParaLiberar = Omit<HechosDelEquipo, "enUso">;

const MS_POR_HORA = 3_600_000;

/**
 * **¿Esta unidad volverá a estar libre cuando acabe lo que tiene dentro?**
 *
 * Lo decide `clasificar`, el MISMO que usa la ocupación, no una regla paralela: se le pregunta por
 * la unidad dándola por ocupada, y si el único problema que devuelve es `EN_USO`, entonces estar
 * ocupada es todo lo que le pasa y acabará. Si trae `RETIRADO` o `CONDICION`, alguien tiene que ir
 * antes de volver a llenarla, así que anunciar su hora es prometer una unidad que no va a servir.
 */
function volveraAEstarLibre(unidad: UnidadParaLiberar): boolean {
  return clasificar({ ...unidad, enUso: true }).motivos.every((m) => m === "EN_USO");
}

/** `null`, no-finito (NaN, Infinity) y no positivo (0, negativo) cuentan igual: no declarada. */
function finDeLaCorrida(c: CorridaConDuracion): number | null {
  // NaN daría una fecha inválida que se pintaría como hora; 0 o un negativo darían el INICIO de
  // la corrida, o una hora anterior a él, y se leería como «ya debía liberarse» de una duración
  // que ninguna receta puede declarar. **Es la misma regla de los otros dos consumidores**: la
  // escritura la rechaza (`validateExpectedHours`, `processTargets.ts`: `expected_hours_must_be_positive`)
  // y la cola la declara inválida (`estadoDeRitmo`, `ritmo.ts`: `duracion_esperada_invalida_en_la_base`).
  // Aquí no se lanza —la base puede traerlo corrupto y la pantalla no debe caer—, pero tampoco se
  // trata como duración: en la misma pantalla la cola diría «inválida» y esta línea la citaría.
  if (c.expectedHours === null || !Number.isFinite(c.expectedHours) || c.expectedHours <= 0) return null;
  return c.iniciadaEn.getTime() + c.expectedHours * MS_POR_HORA;
}

/**
 * La PRÓXIMA unidad en liberarse, o `null` si ninguna unidad conocida tiene nada dentro.
 *
 * **Se agrupa por UNIDAD, y dentro de cada unidad manda el fin MAYOR** — el defecto de
 * `PENDING_IMPLEMENTATIONS/015`: antes se tomaba el mínimo global, así que dos corridas en el mismo
 * tanque hacían anunciar la hora de la primera, a la que ese tanque **no** va a estar libre. Dos
 * corridas en una unidad son un conflicto de datos que la ocupación ya cuenta aparte
 * (`Ocupacion.conflictos`); lo que esta función no puede hacer es apoyarse en él para prometer una
 * hora falsa. Entre unidades sí manda el fin menor: se pregunta por la próxima.
 *
 * **Una unidad con una sola corrida sin fin conocido no tiene hora**, aunque otra corrida de la
 * MISMA unidad sí lo declare: no se libera hasta que acaben las dos. Es la misma forma del defecto,
 * más pequeña.
 *
 * **Y una unidad que no volverá a estar libre no cuenta** (ver `volveraAEstarLibre`): su corrida
 * acabará, pero la unidad seguirá sin servir. Como la corrida muda, no aporta hora — así que un
 * tanque retirado con algo dentro deja `sin_duracion_declarada` y no `null`: hay algo ocupado y no
 * se sabe cuándo habrá unidad, que es distinto de «no hay nada ocupado».
 *
 * **Una corrida de una unidad que no está en `unidades` queda fuera del alcance**, igual que
 * `ocupacionDelSitio` la manda a `ajenas`: sus números no la incluyen, y esta hora tampoco debe.
 */
export function proximaLiberacion(input: {
  readonly corridas: readonly CorridaConDuracion[];
  /** Las unidades VISIBLES para quien mira, con su estado. Obligatoria y sin valor por defecto. */
  readonly unidades: readonly UnidadParaLiberar[];
  readonly ahora: Date;
}): Liberacion | null {
  const porId = new Map(input.unidades.map((u) => [u.id, u] as const));

  // Agrupado por unidad: `undefined` = no se ha visto; `null` = tiene algo cuyo fin no se sabe.
  const finPorUnidad = new Map<string, number | null>();
  for (const c of input.corridas) {
    const id = c.equipmentId ?? c.bedLocationId;
    if (id === null) continue;
    const unidad = porId.get(id);
    if (unidad === undefined) continue;
    const previo = finPorUnidad.get(id);
    if (previo === null) continue; // ya desconocida: no se recupera con otra corrida
    const fin = volveraAEstarLibre(unidad) ? finDeLaCorrida(c) : null;
    finPorUnidad.set(id, fin === null ? null : previo === undefined ? fin : Math.max(previo, fin));
  }

  if (finPorUnidad.size === 0) return null;
  const conocidos = [...finPorUnidad.values()].filter((f): f is number => f !== null);
  return conocidos.length === 0
    ? { tipo: "sin_duracion_declarada" }
    : { tipo: "a_las", cuando: new Date(Math.min(...conocidos)) };
}
