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
 * **Una receta al revés (`minValue > maxValue`) tampoco dibuja banda: `banda_al_reves`.** Escalar
 * contra ella daría una banda IDÉNTICA a la de una receta correcta (`escalaY` manda `minValue` a
 * `alto` y `maxValue` a `0` sin mirar cuál es mayor) y los PUNTOS saldrían espejados: un pH de 4,9
 * sobrefermentado se pintaría abajo, donde una receta buena pone los valores bajos, y «hacia
 * arriba, el valor más alto» sería falso. Se niega a dibujar la banda y lo dice, como con ancho
 * cero; los puntos se escalan contra sus propios datos, igual que sin banda, y por eso el eje
 * vuelve a significar lo que dice.
 *
 * **Una banda de ancho cero (`minValue === maxValue`) tampoco dibuja banda ni escala contra ella:
 * `banda_de_ancho_cero`.** `escalaY` manda TODO valor a media altura cuando el rango es cero, así
 * que escalar contra esa banda destruía la diferencia entre lecturas: una serie 4,5 → 4,9 → 4,7
 * salía como una recta plana («nada cambió») y dos valores distintos a la misma hora se
 * superponían exactamente — a la vez que la pantalla avisaba de que no puede juzgarlas. Ahora es el
 * mismo camino que `banda_al_reves`: sin banda dibujada y puntos escalados contra sus propios
 * datos. Qué lecturas «quedan dentro» sigue sin afirmarse (`juicioDeBanda`); sólo cambia la geometría.
 *
 * **En SVG la Y crece hacia ABAJO.** El valor máximo de la escala queda arriba (`y = 0`) y el
 * mínimo abajo (`y = alto`). Con la Y al revés la curva seguiría pareciendo una curva, así que
 * sólo una prueba con números a mano lo ve.
 *
 * **Contra qué se escala el eje Y** (decisión de diseño, no la deduce nadie del tipo):
 * - con banda, contra la banda: `minValue` → `alto`, `maxValue` → `0`. Un valor fuera de la banda
 *   queda fuera del lienzo (`y < 0` o `y > alto`); no se recorta aquí, porque recortar escondería
 *   justo la lectura que se salió de la receta. Qué hacer con eso lo decide quien pinta.
 * - sin banda (también con `banda_al_reves` y `banda_de_ancho_cero`), contra el mínimo y el máximo
 *   de los propios datos: es la única escala disponible.
 *
 * **Los puntos degenerados no dan `NaN`.** Con una sola lectura, o con todas iguales, el rango
 * vale cero y dividir entre él da `NaN` (o `Infinity`). El valor va a **media altura** (`alto / 2`):
 * no hay un extremo que lo ponga arriba o abajo. Con la X pasa igual —una sola lectura, o todas a
 * la misma hora— y va a **media anchura** (`ancho / 2`): un punto suelto en `x = 0` parecería el
 * arranque de una curva que todavía no tiene recorrido, y en el centro se ve que es un dato solo.
 *
 * Las lecturas se ordenan por hora: el orden en que lleguen no debe cambiar la curva.
 *
 * **Devuelve también las lecturas sin escalar y el rango declarado** (`lecturas`, `rango`): los
 * puntos son coordenadas y de ellas no se recupera qué se midió. Los necesitan los ejes
 * (`ejesDeLaCurva`) y la cita de qué sugiere el último valor (`riesgoDeEsperar`); no cambian
 * ninguna coordenada.
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
/** Los tres momentos de `ProcessTargetMoment`, tal cual los nombra el esquema. */
export type MomentoDeObjetivo = "initial" | "during" | "final";

/**
 * **A qué lecturas se aplica la banda**, derivado del momento del objetivo y de nada más.
 *
 * `during` es el único momento que describe una trayectoria, y el esquema ya lo dice al hablar de
 * `everyHours`: «un objetivo inicial o final ocurre una vez; pedirle un ritmo es una
 * contradicción». `initial` y `final` son eventos de un instante, así que su banda **no cubre el
 * recorrido**: se marca en su extremo del eje y juzga una sola lectura.
 *
 * El defecto que esto cierra (`PENDING_IMPLEMENTATIONS/017`): una meta `final` se usaba como banda
 * de TODA la trayectoria, así que un pH que baja de 6,5 a 4,0 **por diseño** salía como «2 lecturas
 * fuera del rango de la receta» durante todo el descenso. Daniel lo describió al revés y es la
 * misma cosa: en lavado y natural el Brix o el pH se miden **una vez**, en la cereza o el mosto
 * antes de la cama, y después sólo humedad; en fermentación el pH se mide a lo largo y baja con el
 * tiempo. Un solo campo distingue los dos mundos.
 */
export type AlcanceDeLaBanda = "trayectoria" | "al_inicio" | "al_final";

/** Un `ProcessTarget` tal como lo necesita la curva. Los tres valores son anulables en el esquema; `momento` no. */
export interface ObjetivoDeCurva {
  readonly momento: MomentoDeObjetivo;
  readonly minValue: number | null;
  readonly maxValue: number | null;
  readonly targetValue: number | null;
}

export type Banda =
  | {
      readonly tipo: "banda";
      /** Ver `AlcanceDeLaBanda`: sale del momento del objetivo, no de la geometría. */
      readonly alcance: AlcanceDeLaBanda;
      readonly yMin: number;
      readonly yMax: number;
      readonly yObjetivo: number | null;
    }
  | { readonly tipo: "sin_objetivo_declarado" }
  /** `minValue > maxValue`: no hay banda que dibujar sin espejar la curva. Ver el encabezado. */
  | { readonly tipo: "banda_al_reves" }
  /** `minValue === maxValue`: no hay rango contra el que escalar. Ver el encabezado. */
  | { readonly tipo: "banda_de_ancho_cero" };

/** Una lectura tal como llegó: instante y valor, sin escalar. */
export interface LecturaDeCurva {
  readonly occurredAt: Date;
  readonly value: number;
}

export interface Curva {
  readonly puntos: readonly PuntoDeCurva[];
  readonly banda: Banda;
  readonly ancho: number;
  readonly alto: number;
  /**
   * Las lecturas de las que salieron `puntos`, **por hora ascendente y sin escalar**. Los puntos son
   * coordenadas del lienzo y de ahí no se recupera qué se midió; quien rotula los ejes
   * (`ejesDeLaCurva`) o cita qué sugiere el último valor (`riesgoDeEsperar`) las necesita tal cual.
   * **«La última» no es `lecturas[lecturas.length - 1]`:** con varias en el mismo instante el orden entre
   * ellas es arbitrario, y quien necesite la última pregunta a `ultimaLectura`, que dice `null` cuando
   * no la hay.
   */
  readonly lecturas: readonly LecturaDeCurva[];
  /**
   * El rango que declaró la receta, **tal cual** (`minValue`, `maxValue`), o `null` si falta
   * alguno de los dos extremos. A diferencia de `banda`, **no descarta** el rango al revés ni el de
   * ancho cero: esos dos NO se dibujan (`banda` lo dice) pero siguen siendo lo que la receta
   * declaró, y quien rotula decide qué hacer con ellos en vez de adivinar por qué falta.
   */
  readonly rango: { readonly min: number; readonly max: number } | null;
  /**
   * **Qué objetivo de los declarados rige esta curva, y cuándo no se eligió ninguno.** Lo decide
   * `elegirObjetivo` con los objetivos que entraron, y viaja DENTRO de la curva a propósito: como
   * campo aparte, una pantalla podía recibir una banda dibujada y una elección que la contradijera,
   * y nada lo habría cazado.
   *
   * Hace falta además de `banda` porque `banda` no distingue dos silencios muy distintos: «la
   * receta no declara rango» y «declara dos, de instantes distintos, y no se elige por ti». Los dos
   * dan `sin_objetivo_declarado` en `banda`.
   */
  readonly eleccion: EleccionDeObjetivo;
}

/**
 * La lectura más reciente, **o `null` si no hay UNA última**: sin lecturas, o con varias que comparten
 * el instante máximo.
 *
 * **Un empate de instante no tiene «última».** `curvaDeLote` ordena por `getTime()`, y un empate devuelve
 * `0`: el orden entre lecturas del mismo instante es el que devolvió la base —arbitrario y no estable—,
 * así que «la de más al final» cambia de una consulta a otra. Medido en la base local: 7 de 10 lotes
 * tienen TODAS sus lecturas en el mismo instante, y en un lote se llegó a presentar la de **recepción**
 * (la primera de la corrida) como «tu última lectura». **No se inventa un desempate** —ni por valor, ni
 * por id, ni por nota—: cuando no se puede decir cuál es la última, no se afirma. Es el «nunca un cero
 * donde falta un registro» aplicado a la identidad de la lectura.
 *
 * No depende de que `lecturas` venga ordenada: busca el instante máximo y cuenta las que caen en él.
 * Un instante que no es un número (`Invalid Date`) tampoco tiene última: `null`.
 */
export function ultimaLectura(lecturas: readonly LecturaDeCurva[]): LecturaDeCurva | null {
  const i = indiceDeLaUnicaEnElExtremo(lecturas, "ultima");
  return i === null ? null : lecturas[i]!;
}

/**
 * El **índice** de la única lectura en un extremo del tiempo, o `null` si no hay UNA.
 *
 * Es la regla de `ultimaLectura` —que se niega a desempatar— puesta en un solo sitio y abierta por
 * los dos lados, porque un objetivo `initial` necesita lo simétrico de un `final`. Duplicar la
 * regla es cómo se pierde: la versión de `readingsForMoment`
 * (`lib/traceability/processTargets.ts`) toma `ordered[0]` y `ordered[last]` **sin** comprobar el
 * empate, y ésa es exactamente la forma del defecto que se cerró al medir que **7 de 10 lotes**
 * reales tienen TODAS sus lecturas en el mismo instante.
 *
 * Devuelve el índice y no la lectura porque quien juzga necesita casar con `puntos`, que va en el
 * mismo orden. Un instante que no es un número (`Invalid Date`) no tiene extremo: `NaN` no es igual
 * a nada, ni a sí mismo, así que el filtro sale vacío y la respuesta es `null`.
 */
export function indiceDeLaUnicaEnElExtremo(
  lecturas: readonly LecturaDeCurva[],
  extremo: "primera" | "ultima",
): number | null {
  if (lecturas.length === 0) return null;
  const instantes = lecturas.map((l) => l.occurredAt.getTime());
  const buscado = extremo === "ultima" ? Math.max(...instantes) : Math.min(...instantes);
  const enElExtremo = instantes.reduce<number[]>((is, v, i) => (v === buscado ? [...is, i] : is), []);
  return enElExtremo.length === 1 ? enElExtremo[0]! : null;
}

/**
 * **Cuál de los objetivos declarados rige la curva — y cuándo NO se elige.**
 *
 * El defecto de `PENDING_IMPLEMENTATIONS/017` no era sólo el alcance de la banda: era que
 * `datosDelTablero` hacía `find(during) ?? find(final)` y por tanto **elegía en silencio** entre lo
 * que la receta declaraba. La regla, dicha:
 *
 * - `during` manda, porque es el único momento que describe una trayectoria y por tanto el único
 *   que puede juzgar una serie de lecturas.
 * - Con un solo objetivo, ése. Es el caso que Daniel describe para lavado y natural: Brix o pH
 *   medidos **una vez** en la cereza o el mosto, y después sólo humedad.
 * - Con `initial` y `final` a la vez y sin `during`, **no se elige**: los dos son legítimos, hablan
 *   de instantes distintos, y preferir uno sería inventar cuál le importa al operario. Se nombran
 *   los momentos que había para que la pantalla lo diga en vez de dibujar la mitad de la verdad.
 *
 * Los momentos se devuelven en el orden del tiempo (`initial` antes de `final`), no en el de
 * llegada: el orden de las filas de la base es arbitrario y la frase no debe cambiar con él.
 */
export type EleccionDeObjetivo =
  | { readonly tipo: "elegido"; readonly objetivo: ObjetivoDeCurva }
  | { readonly tipo: "sin_objetivo_declarado" }
  /**
   * **No se pudo saber qué receta aplicaba** (`PENDING_IMPLEMENTATIONS/019`). Distinto de
   * `sin_objetivo_declarado`, que afirma algo **sobre la receta**: aquí no se consultó ninguna.
   * Sin corrida abierta —o con una corrida sin versión de receta— lo único demostrado es que la
   * consulta no recuperó nada, y eso no autoriza a hablar de lo que la receta declara.
   */
  | { readonly tipo: "receta_no_resuelta" }
  | { readonly tipo: "varios_sin_trayectoria"; readonly momentos: readonly MomentoDeObjetivo[] };

const ORDEN_DEL_TIEMPO: readonly MomentoDeObjetivo[] = ["initial", "during", "final"];

/**
 * `recetaResuelta` entra **obligatorio y sin valor por omisión**: el defecto de 019 era
 * precisamente que nadie lo decía, y un valor por omisión deja que un sitio nuevo vuelva a
 * afirmar sobre una receta que no miró. Con objetivos en la lista el indicador no manda —si hay
 * objetivos, la receta se resolvió— así que no puede borrar un rango que de verdad existe.
 */
export function elegirObjetivo(
  objetivos: readonly ObjetivoDeCurva[],
  recetaResuelta: boolean,
): EleccionDeObjetivo {
  if (objetivos.length === 0) {
    return recetaResuelta ? { tipo: "sin_objetivo_declarado" } : { tipo: "receta_no_resuelta" };
  }
  const trayectoria = objetivos.find((o) => o.momento === "during");
  if (trayectoria) return { tipo: "elegido", objetivo: trayectoria };
  if (objetivos.length === 1) return { tipo: "elegido", objetivo: objetivos[0]! };
  return {
    tipo: "varios_sin_trayectoria",
    momentos: ORDEN_DEL_TIEMPO.filter((m) => objetivos.some((o) => o.momento === m)),
  };
}

/** Posición de `v` entre `min` y `max` en un eje de `tamano`, con el máximo en 0. Rango cero: mitad. */
function escalaY(v: number, min: number, max: number, tamano: number): number {
  if (max === min) return tamano / 2;
  return tamano - ((v - min) / (max - min)) * tamano;
}

export function curvaDeLote(input: {
  readonly lecturas: readonly LecturaDeCurva[];
  /**
   * **TODOS los objetivos que la receta declara** para esta variable y esta fase, con su momento.
   * Cuál rige la curva lo decide `elegirObjetivo` aquí dentro, y la respuesta sale en
   * `Curva.eleccion`: quien llama no elige, y por tanto no puede elegir mal.
   *
   * **Vacío tiene DOS motivos y no dicen lo mismo** (`PENDING_IMPLEMENTATIONS/019`): la receta se
   * consultó y no declara nada para esta variable —legítimo y frecuente—, o **no se pudo saber qué
   * receta aplicaba**. Los distingue `recetaResuelta`, no esta lista. Esta línea decía sólo lo
   * primero, y por eso la pantalla afirmaba sobre la receta sin haberla mirado.
   */
  readonly objetivos: readonly ObjetivoDeCurva[];
  /**
   * **¿Se supo qué receta aplicaba?** `false` cuando no hay corrida abierta, o cuando la corrida
   * no tiene versión de receta: entonces `objetivos` está vacío porque no se consultó nada.
   *
   * Opcional **sólo aquí**, con `true` por omisión, y el motivo es medido: 82 llamadas de prueba
   * construyen curvas para medir bandas y ejes, donde la resolución de la receta no es el asunto,
   * y obligarlas a repetirlo son 82 ediciones en los mismos archivos cuyos conflictos de
   * encadenado ya costaron 59 errores de sintaxis. En `elegirObjetivo` —la casa de la regla— es
   * obligatorio, y el único sitio de producción que llama aquí lo pasa siempre: lo exige el
   * guardia de `datos-del-tablero.test.ts` en el carril con base.
   */
  readonly recetaResuelta?: boolean;
  readonly ancho: number;
  readonly alto: number;
}): Curva {
  const { ancho, alto } = input;
  const eleccion = elegirObjetivo(input.objetivos, input.recetaResuelta ?? true);
  const objetivo = eleccion.tipo === "elegido" ? eleccion.objetivo : null;
  const lecturas = [...input.lecturas].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  const minValue = objetivo?.minValue ?? null;
  const maxValue = objetivo?.maxValue ?? null;
  const alReves = minValue !== null && maxValue !== null && minValue > maxValue;
  const anchoCero = minValue !== null && maxValue !== null && minValue === maxValue;
  const hayBanda = minValue !== null && maxValue !== null && !alReves && !anchoCero;

  const banda: Banda = alReves
    ? { tipo: "banda_al_reves" }
    : anchoCero
      ? { tipo: "banda_de_ancho_cero" }
      : bandaDe(objetivo, alto);
  const rango = minValue !== null && maxValue !== null ? { min: minValue, max: maxValue } : null;
  if (lecturas.length === 0) return { puntos: [], banda, ancho, alto, lecturas, rango, eleccion };

  const valores = lecturas.map((l) => l.value);
  const escalaMin = hayBanda ? minValue : Math.min(...valores);
  const escalaMax = hayBanda ? maxValue : Math.max(...valores);

  const t0 = lecturas[0]!.occurredAt.getTime();
  const t1 = lecturas[lecturas.length - 1]!.occurredAt.getTime();

  const puntos = lecturas.map((l): PuntoDeCurva => ({
    x: t1 === t0 ? ancho / 2 : ((l.occurredAt.getTime() - t0) / (t1 - t0)) * ancho,
    y: escalaY(l.value, escalaMin, escalaMax, alto),
  }));

  return { puntos, banda, ancho, alto, lecturas, rango, eleccion };
}

/** `during` cubre el recorrido; `initial` y `final` son eventos de un instante. Ver `AlcanceDeLaBanda`. */
const ALCANCE_DEL_MOMENTO: Readonly<Record<MomentoDeObjetivo, AlcanceDeLaBanda>> = {
  initial: "al_inicio",
  during: "trayectoria",
  final: "al_final",
};

function bandaDe(objetivo: ObjetivoDeCurva | null, alto: number): Banda {
  const minValue = objetivo?.minValue ?? null;
  const maxValue = objetivo?.maxValue ?? null;
  if (objetivo === null || minValue === null || maxValue === null) return { tipo: "sin_objetivo_declarado" };
  const { targetValue } = objetivo;
  return {
    tipo: "banda",
    alcance: ALCANCE_DEL_MOMENTO[objetivo.momento],
    yMin: escalaY(minValue, minValue, maxValue, alto),
    yMax: escalaY(maxValue, minValue, maxValue, alto),
    yObjetivo: targetValue === null ? null : escalaY(targetValue, minValue, maxValue, alto),
  };
}
