/**
 * ¿Este batch va tarde, y te debe alguna lectura?
 *
 * **Para qué existe (2026-09-13).** Daniel, auditando la pantalla de lotes:
 * mirando la lista decide «a cuál le toca algo ahora». La lista es una cola de
 * trabajo, no un inventario. Para ordenarla hace falta saber qué es «tarde», y
 * él decidió que eso sale de la receta — de ahí `expectedHours` y `everyHours`.
 *
 * **Son dos preguntas distintas y se contestan por separado**, porque un batch
 * puede ir en hora y deberte una medición, y al revés:
 *
 *   - `demora`   — ¿lleva más horas en la fase de las que la receta dice?
 *   - `debidas`  — ¿cuántas lecturas de cada variable deberían existir ya?
 *
 * **`null` no es `false`.** Cuando la receta no declara ritmo, `demora` vale
 * `null` y no `false`: «no se sabe» y «va bien» son hechos distintos, y
 * confundirlos haría que un lote sin receta pareciera puntual. La pantalla los
 * pinta distinto — sin receta ordena por horas en fase y no promete nada.
 *
 * **Pura a propósito.** Recibe el instante, la hora de inicio y lo que la receta
 * dice; no consulta la base. Así se puede probar con entrada hostil sin montar
 * un batch entero, que es lo que convierte un guardia en algo más que adorno.
 */

export class RitmoError extends Error {}

export interface MetaConRitmo {
  variable: string;
  /** Cada cuántas horas toca medirla. `null` = la receta no lo declara. */
  everyHours: number | null;
  /** La última lectura de esa variable en esta fase, o `null` si no hay. */
  ultimaLectura: Date | null;
}

export interface LecturaDebida {
  variable: string;
  cada: number;
  /** Horas desde la última lectura — o desde el inicio de la fase si no hay. */
  horasSinMedir: number;
  /**
   * **Intervalos completos transcurridos desde la última lectura.** Siempre ≥ 1.
   *
   * NO es «cuántas lecturas deberían existir en toda la fase y faltan»: eso
   * exigiría el historial completo, que esta función no recibe. La revisión de
   * Codex señaló la diferencia con un caso real — fase de 14 h, ritmo de 6 h y
   * una lectura en la hora 13 devuelve **0**, aunque en toda la fase debieran
   * existir dos y sólo exista una.
   *
   * **Y devolver 0 ahí es lo correcto operativamente**, que es para lo que
   * existe: a la hora 14, con una lectura de hace una hora, el operador NO debe
   * una medición ahora. La deuda histórica es otra pregunta —de informe, no de
   * cola de trabajo— y se contesta contando las mediciones de la fase.
   */
  debidas: number;
}

export interface EstadoDeRitmo {
  horasEnFase: number;
  /** Lo que la receta declara, o `null` si no lo declara. */
  esperadas: number | null;
  /** `true` tarde · `false` en hora · **`null` no se sabe**. */
  demora: boolean | null;
  /** Horas de más sobre lo esperado. `null` si no hay nada que comparar. */
  horasDeMas: number | null;
  /** Sólo las variables que deben al menos una lectura, peor primero. */
  debidas: LecturaDebida[];
}

const HORA = 3_600_000;

/**
 * Una fecha que no es una fecha.
 *
 * **Por qué se comprueba antes de comparar.** `new Date("lo que sea")` da
 * `Invalid Date`, y cualquier comparación con él es `false` — así que un dato
 * corrupto pasaría los dos guardias de abajo y saldría por el otro lado como
 * `NaN`. Y `NaN > x` también es `false`: un lote con fechas rotas se colaría en
 * la cola diciendo «no va tarde». Es la misma trampa que `CLAUDE.md` documenta
 * con las imágenes: una comparación con `NaN` **siempre halaga la hipótesis**.
 */
function exigeFecha(d: Date, campo: string): void {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new RitmoError(`${campo}_no_es_una_fecha`);
  }
}

/** Horas entre dos instantes, sin redondear: media hora tarde sigue siendo tarde. */
function horasEntre(desde: Date, hasta: Date): number {
  return (hasta.getTime() - desde.getTime()) / HORA;
}

export function estadoDeRitmo(input: {
  ahora: Date;
  /** Cuándo empezó la fase — el `startedAt` de la fermentación o del secado. */
  faseIniciada: Date;
  /** Lo que la receta dice que debe durar, o `null`. */
  expectedHours: number | null;
  metas: readonly MetaConRitmo[];
}): EstadoDeRitmo {
  const { ahora, faseIniciada, expectedHours, metas } = input;

  exigeFecha(ahora, "ahora");
  exigeFecha(faseIniciada, "fase_iniciada");

  // **El ritmo puede venir corrupto de la base y la función no puede fiarse.**
  // `validateTargets` lo rechaza al escribir, pero esa regla vive en TypeScript
  // y NO en la base: un importador o un SQL directo puede dejar un 0 o un
  // negativo. Con 0 la división da `Infinity` y con negativo da deuda al revés.
  // Lo cazó la revisión de Codex (2026-09-13).
  for (const m of metas) {
    if (m.everyHours != null && (!Number.isFinite(m.everyHours) || m.everyHours <= 0)) {
      throw new RitmoError("ritmo_invalido_en_la_base");
    }
  }
  if (expectedHours != null && (!Number.isFinite(expectedHours) || expectedHours <= 0)) {
    throw new RitmoError("duracion_esperada_invalida_en_la_base");
  }

  // Una fase que empieza en el futuro es un dato malo, no un caso a ordenar.
  // Devolver horas negativas lo colaría en la lista como «lo más reciente».
  if (faseIniciada.getTime() > ahora.getTime()) {
    throw new RitmoError("fase_iniciada_en_el_futuro");
  }

  const horasEnFase = horasEntre(faseIniciada, ahora);

  const esperadas = expectedHours ?? null;
  const demora = esperadas == null ? null : horasEnFase > esperadas;
  const horasDeMas = esperadas == null ? null : Math.max(0, horasEnFase - esperadas);

  const debidas: LecturaDebida[] = [];
  for (const m of metas) {
    if (m.everyHours == null) continue; // sin ritmo declarado no se debe nada

    // Sin ninguna lectura, el reloj corre desde que empezó la fase: la primera
    // toca `everyHours` después de empezar, no «cuando alguien mida por primera
    // vez». Medir desde la última lectura cuando no hay ninguna haría que un
    // batch sin medir jamás debiera nada — el caso que más importa.
    if (m.ultimaLectura != null) exigeFecha(m.ultimaLectura, "ultima_lectura");
    // Una lectura ANTERIOR al inicio de la fase no es de esta fase: contarla
    // generaría deuda desde antes de que la fase existiera. Se usa el inicio,
    // que es el suelo real del intervalo.
    const cruda = m.ultimaLectura ?? faseIniciada;
    const referencia = cruda.getTime() < faseIniciada.getTime() ? faseIniciada : cruda;
    if (referencia.getTime() > ahora.getTime()) {
      throw new RitmoError("lectura_en_el_futuro");
    }
    const horasSinMedir = horasEntre(referencia, ahora);
    const cuantas = Math.floor(horasSinMedir / m.everyHours);
    if (cuantas >= 1) {
      debidas.push({ variable: m.variable, cada: m.everyHours, horasSinMedir, debidas: cuantas });
    }
  }

  // Peor primero: la pantalla enseña la más urgente y el operador no ordena.
  debidas.sort((a, b) => b.debidas - a.debidas || b.horasSinMedir - a.horasSinMedir);

  return { horasEnFase, esperadas, demora, horasDeMas, debidas };
}

/**
 * Un número para ordenar la cola, mayor = más urgente.
 *
 * **Por qué un número y no un booleano.** La lista tiene que ordenar, no sólo
 * separar. Las lecturas debidas pesan más que la demora porque son accionables
 * ahora mismo —se mide y se acabó—, mientras que una fase larga puede ser una
 * decisión deliberada del operador.
 *
 * **Un batch sin ritmo declarado puntúa 0**, no negativo: queda debajo de los
 * que sí tienen algo pendiente, y por encima de nada. No se le inventa una
 * urgencia que la receta no declaró.
 */
export function puntajeDeUrgencia(estado: EstadoDeRitmo): number {
  // **`demora: null` y `demora: false` puntúan igual, y es deliberado.** La
  // revisión de Codex lo señaló como pérdida de información, y lo es: el
  // puntaje es UN número y no puede llevar tres estados. Lo que no se pierde es
  // el hecho — `estado.demora` sigue valiendo `null`, y la pantalla lo pinta
  // distinto. Inventarle una urgencia a lo que la receta no declaró sería peor
  // que ordenarlo abajo.
  const porLecturas = estado.debidas.reduce((suma, d) => suma + d.debidas, 0) * 10;
  const porDemora = estado.demora === true ? Math.min(estado.horasDeMas ?? 0, 100) : 0;
  return porLecturas + porDemora;
}
