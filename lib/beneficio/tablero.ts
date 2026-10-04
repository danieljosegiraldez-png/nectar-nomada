/**
 * El tablero del beneficio, puro: qué pide atención ahora.
 *
 * **Sin base de datos a propósito.** Recibe hechos y devuelve grupos ordenados, así que sus
 * pruebas son herméticas y pueden escribir entradas hostiles que ninguna base sembrada produce
 * —un ritmo de cero horas, una fase sin duración declarada, dos motores en desacuerdo—. Las
 * lecturas viven en `datosDelTablero.ts`.
 *
 * **Lo que este módulo existe para impedir** no es un orden mal calculado: es que el tablero
 * **diga algo tranquilizador sin haberlo medido**. De ahí las dos reglas que gobiernan todo lo
 * demás: «Sin veredicto» nunca se mezcla con «En curso», y un `demora: null` nunca se pinta
 * como «en hora».
 *
 * Diseño: `docs/superpowers/specs/2026-09-16-tablero-del-beneficio-design.md` §4.2.
 */
import { estadoDeRitmo, puntajeDeUrgencia, RitmoError, type EstadoDeRitmo, type MetaConRitmo } from "../traceability/ritmo";
import type { SinVeredicto } from "./desdeElLote";
import {
  clasificar,
  resumir,
  type Clasificacion,
  type HechosDelEquipo,
  type MotivoNoDisponible,
  type ResumenDeDisponibilidad,
} from "../equipos/disponibilidad";
import type { EstadoDeVerificacion } from "../equipos/verificacion";

export type GrupoDeAtencion = "critico" | "listo_para_decidir" | "aviso" | "sin_veredicto" | "en_curso";

/** Los grupos en el orden en que se pintan. El índice es la gravedad. */
const ORDEN: readonly GrupoDeAtencion[] = [
  "critico",
  "listo_para_decidir",
  "aviso",
  "sin_veredicto",
  "en_curso",
];

/**
 * Lo único que la cola lee de un dictamen.
 *
 * Se tipa por lo que **de verdad** mira, y no por `PHAssessment` entero, para no exigir un
 * `perfil` ni un `currentPh` que aquí no se usan: un tipo que pide más de lo que lee obliga a las
 * pruebas a fabricar datos que no significan nada.
 */
export interface DictamenParaCola {
  readonly status: string;
  readonly severity: "INFO" | "WARNING" | "CRITICAL";
}

export interface VeredictoParaCola {
  readonly ph: DictamenParaCola | null;
  readonly brix: DictamenParaCola | null;
  readonly secado: DictamenParaCola | null;
}

/**
 * Tarea 9, ronda de arreglo 1 (2026-10-02): el lote cuyo linaje pasa del tope de R1 (64 generaciones). No se sabe qué proceso
 * lo cubre, así que no hay veredicto; la fila lo dice —en «sin veredicto», como toda razón— en vez de tumbar el tablero entero.
 */
export const LINAJE_DEMASIADO_HONDO = "LINAJE_DEMASIADO_HONDO";

/** Lo que el tablero necesita de un lote. Lo llena `datosDelTablero`. */
export interface EntradaDeLoteParaTablero {
  readonly lotId: string;
  readonly lotCode: string;
  /**
   * **La corrida que esta entrada describe.** Un lote puede tener varias abiertas, y el tablero
   * ensaña UNA; sin este campo la curva tenía que volver a elegir con un `find` propio y podía abrir
   * otra distinta de la que explica el aviso (`PENDING_IMPLEMENTATIONS/016`, segunda mitad): dos
   * reglas de selección para la misma pregunta.
   */
  readonly corridaId: string;
  /** El veredicto ya resuelto, o la razón por la que no lo hay. */
  readonly veredicto: VeredictoParaCola | SinVeredicto | typeof LINAJE_DEMASIADO_HONDO;
  /** Cuándo empezó la fase abierta. `null` = no hay fase, y el lote no entra en la cola. */
  readonly faseIniciada: Date | null;
  /** De la versión de receta de su `LotProcess`. `null` = la receta no lo declara. */
  readonly expectedHours: number | null;
  /** Una por variable con ritmo, con su última lectura DENTRO de la fase. */
  readonly metas: readonly MetaConRitmo[];
  /** La más reciente de todas sus lecturas, para el orden. `null` si no hay. */
  readonly ultimaLectura: Date | null;
}

export interface FilaDeAtencion {
  readonly lotId: string;
  readonly lotCode: string;
  readonly grupo: GrupoDeAtencion;
  /** **TODOS** los motivos que aplican, no el que ganó el grupo. */
  readonly motivos: readonly string[];
  /** El ritmo, o el código del `RitmoError` si sus datos estaban corruptos. */
  readonly ritmo: EstadoDeRitmo | { readonly error: string };
  readonly puntaje: number;
  readonly ultimaLectura: Date | null;
}

/** Estados que significan «no se sabe», no «va bien». */
const NO_SE_SABE = new Set(["DATA_INSUFFICIENT", "SENSOR_FAULT"]);
/** Estados que son una decisión que se estropea si espera, no un problema. */
const LISTO = new Set(["TERMINATION_READY", "TARGET_REACHED"]);

export const MOTIVO_DESVIACION = "DESVIACION_DE_BALANCE_ABIERTA";

function dictamenes(v: VeredictoParaCola): readonly DictamenParaCola[] {
  return [v.ph, v.brix, v.secado].filter((d): d is DictamenParaCola => d != null);
}

/**
 * **En qué grupo cae UNA entrada, y por qué** — el cálculo que `colaDeAtencion` hacía en su propio
 * bucle, extraído para que tenga **un solo sitio**.
 *
 * **Por qué se extrajo** (`PENDING_IMPLEMENTATIONS/016`): `datosDelTablero` tiene que elegir, entre
 * las varias corridas abiertas de un lote, **cuál sale en el tablero**, y la regla que Daniel eligió
 * el 2026-10-02 es «la de veredicto más grave; si empatan, la que empezó antes». Eso necesita el
 * grupo de cada candidata **antes** de descartar ninguna. Calcularlo allí con un orden de gravedad
 * propio habría puesto dos definiciones de «más grave» en el repositorio, y la que discrepa en
 * silencio es la que esconde una decisión.
 *
 * Devuelve también `motivos` y `ritmo` porque la cola los necesita y recalcularlos sería hacer dos
 * veces el mismo trabajo — y porque el ritmo puede **lanzar**, y ese error se captura aquí una vez.
 */
export function grupoDeLaEntrada(input: {
  readonly lote: EntradaDeLoteParaTablero;
  /**
   * **Cuándo empezó la fase, NO nula.** Va aparte de `lote` a propósito: en el bucle de la cola el
   * `continue` la estrecha, y ese estrechamiento no viaja dentro del objeto. Pedirla aquí obliga a
   * quien llama a haber decidido ya qué hace con una entrada sin fase abierta —la cola la salta—,
   * en vez de afirmar dentro que no es nula.
   */
  readonly faseIniciada: Date;
  readonly desviacionesAbiertasPorLote: ReadonlyMap<string, number>;
  readonly ahora: Date;
}): { readonly grupo: GrupoDeAtencion; readonly motivos: readonly string[]; readonly ritmo: EstadoDeRitmo | { readonly error: string } } {
  const lote = input.lote;
  // El ritmo se calcula lote por lote y su error se captura AQUÍ. Un dato corrupto en uno no
  // puede dejar la página en blanco para los demás.
  let ritmo: EstadoDeRitmo | { error: string };
  try {
    ritmo = estadoDeRitmo({
      ahora: input.ahora,
      faseIniciada: input.faseIniciada,
      expectedHours: lote.expectedHours,
      metas: lote.metas,
    });
  } catch (e) {
    if (!(e instanceof RitmoError)) throw e;
    ritmo = { error: e.message };
  }

  const motivos: string[] = [];
  let grupo: GrupoDeAtencion;

  if (typeof lote.veredicto === "string") {
    // `SinVeredicto` dice la razón, y la razón va a la fila: «este lote no tiene receta que
    // diga su protocolo» y «este lote va bien» son hechos distintos.
    motivos.push(lote.veredicto);
    grupo = "sin_veredicto";
  } else {
    const ds = dictamenes(lote.veredicto);
    for (const d of ds) motivos.push(d.status);
    const critico = ds.some((d) => d.severity === "CRITICAL");
    const listo = ds.some((d) => LISTO.has(d.status));
    const aviso = ds.some((d) => d.severity === "WARNING");
    const noSeSabe = ds.some((d) => NO_SE_SABE.has(d.status));

    const desviaciones = input.desviacionesAbiertasPorLote.get(lote.lotId) ?? 0;
    if (desviaciones > 0) motivos.push(MOTIVO_DESVIACION);

    // Una lectura debida sube a «Aviso». **Ir tarde NO**: una fase larga puede ser deliberada
    // (Daniel, 2026-09-17), así que `demora` sólo ordena dentro de su grupo.
    //
    // El estrechamiento se hace AQUÍ y no se guarda en un booleano: TypeScript no puede
    // estrechar `ritmo` a través de una variable `boolean`, y guardarlo así fue lo que dejó
    // pasar doce pruebas en verde con el typecheck en rojo.
    let debe = false;
    let ritmoRoto = false;
    if ("error" in ritmo) {
      // Un ritmo corrupto es «no se sabe», no «va bien».
      ritmoRoto = true;
      motivos.push(`RITMO_INVALIDO:${ritmo.error}`);
    } else {
      debe = ritmo.debidas.length > 0;
      for (const d of ritmo.debidas) motivos.push(`DEBE_${d.variable.toUpperCase()}`);
    }

    if (critico) grupo = "critico";
    else if (listo) grupo = "listo_para_decidir";
    else if (aviso || desviaciones > 0 || debe) grupo = "aviso";
    else if (noSeSabe || ritmoRoto) grupo = "sin_veredicto";
    else grupo = "en_curso";
  }

  return { grupo, motivos, ritmo };
}

/** La gravedad de un grupo, **menor es más grave**: es el índice en `ORDEN`, que es el único orden. */
export function gravedadDelGrupo(grupo: GrupoDeAtencion): number {
  return ORDEN.indexOf(grupo);
}

/**
 * **UNA entrada por lote, elegida DESPUÉS de evaluar todas sus corridas.**
 *
 * El tablero ensaña una fila por lote —si no, el mismo lote saldría dos veces con la misma clave de
 * React, y `pidenDecision` contaría corridas mientras el recuento cuenta lotes, de modo que una
 * celda diría «1 lote · 2 piden decisión»—. Lo que cambia aquí es **cuál** se queda.
 *
 * **El defecto que cierra** (`PENDING_IMPLEMENTATIONS/016`): se deduplicaba **antes** de evaluar,
 * quedándose con la que empezó antes. Una corrida posterior con una lectura debida, otro veredicto o
 * una duración más corta desaparecía **sin que nada la mirara**. Medido el 2026-10-02: invertir esa
 * comparación dejaba **188 de 188 archivos y 2460 pruebas en verde**, así que la regla no tenía
 * guardia en ninguna parte — y el fixture del caso existía, pero afirmaba cuántas entradas salen y
 * nunca cuál.
 *
 * **La regla, decidida por Daniel el 2026-10-02:** se queda la de **veredicto más grave**; si
 * empatan, la que **empezó antes** —que era la regla vieja, y su razón sigue siendo buena: la que
 * lleva más tiempo abierta es la más atrasada—. La gravedad es la de `ORDEN`, la misma que ordena la
 * cola, no un criterio paralelo.
 *
 * **Determinista a igualdad total:** con el mismo grupo y el mismo instante de inicio se queda la de
 * `corridaId` menor, para que el tablero no cambie entre dos consultas que devuelven las filas en
 * otro orden.
 */
export function unaEntradaPorLote(input: {
  readonly entradas: readonly EntradaDeLoteParaTablero[];
  readonly desviacionesAbiertasPorLote: ReadonlyMap<string, number>;
  readonly ahora: Date;
}): readonly EntradaDeLoteParaTablero[] {
  const gravedadDe = (e: EntradaDeLoteParaTablero): number => {
    // Sin fase abierta no se puede calcular el grupo —la cola salta esas entradas— y una entrada así
    // no compite: cae al fondo del orden.
    if (e.faseIniciada === null) return ORDEN.length;
    return gravedadDelGrupo(
      grupoDeLaEntrada({
        lote: e,
        faseIniciada: e.faseIniciada,
        desviacionesAbiertasPorLote: input.desviacionesAbiertasPorLote,
        ahora: input.ahora,
      }).grupo,
    );
  };

  const mejorPorLote = new Map<string, { readonly entrada: EntradaDeLoteParaTablero; readonly gravedad: number }>();
  for (const entrada of input.entradas) {
    const gravedad = gravedadDe(entrada);
    const actual = mejorPorLote.get(entrada.lotId);
    if (actual === undefined) {
      mejorPorLote.set(entrada.lotId, { entrada, gravedad });
      continue;
    }
    if (gravedad < actual.gravedad) {
      mejorPorLote.set(entrada.lotId, { entrada, gravedad });
      continue;
    }
    if (gravedad > actual.gravedad) continue;
    // Empate de gravedad: la que empezó antes. Una sin fase no le gana a una con fase.
    const nueva = entrada.faseIniciada;
    const vieja = actual.entrada.faseIniciada;
    if (nueva === null) continue;
    if (vieja === null || nueva < vieja) {
      mejorPorLote.set(entrada.lotId, { entrada, gravedad });
      continue;
    }
    if (nueva > vieja) continue;
    // Mismo grupo y mismo instante: por `corridaId`, para que no decida el orden de la consulta.
    if (entrada.corridaId < actual.entrada.corridaId) mejorPorLote.set(entrada.lotId, { entrada, gravedad });
  }

  // En el orden en que llegó el primer candidato de cada lote: el orden de la lista no es una señal,
  // y la cola ordena por su cuenta, pero una salida estable hace las pruebas legibles.
  const vistos = new Set<string>();
  const salida: EntradaDeLoteParaTablero[] = [];
  for (const e of input.entradas) {
    if (vistos.has(e.lotId)) continue;
    vistos.add(e.lotId);
    salida.push(mejorPorLote.get(e.lotId)!.entrada);
  }
  return salida;
}

export function colaDeAtencion(input: {
  readonly lotes: readonly EntradaDeLoteParaTablero[];
  readonly desviacionesAbiertasPorLote: ReadonlyMap<string, number>;
  readonly ahora: Date;
}): readonly FilaDeAtencion[] {
  const filas: FilaDeAtencion[] = [];

  for (const lote of input.lotes) {
    // Sin fase abierta no hay nada que vigilar: el lote no es trabajo pendiente del beneficio.
    if (!lote.faseIniciada) continue;

    // **El grupo, los motivos y el ritmo los calcula `grupoDeLaEntrada`**, no este bucle: el mismo
    // cálculo lo necesita `datosDelTablero` para elegir cuál de las corridas de un lote sale
    // (`PENDING_IMPLEMENTATIONS/016`), y dos definiciones de «más grave» derivan en silencio.
    const { grupo, motivos, ritmo } = grupoDeLaEntrada({
      lote,
      faseIniciada: lote.faseIniciada,
      desviacionesAbiertasPorLote: input.desviacionesAbiertasPorLote,
      ahora: input.ahora,
    });

    filas.push({
      lotId: lote.lotId,
      lotCode: lote.lotCode,
      grupo,
      motivos,
      ritmo,
      // Un ritmo que no se pudo calcular no puntúa: su urgencia es desconocida, y fabricar un
      // número lo ordenaría como si se supiera.
      puntaje: "debidas" in ritmo ? puntajeDeUrgencia(ritmo) : 0,
      ultimaLectura: lote.ultimaLectura,
    });
  }

  // Grupo primero; dentro, puntaje de mayor a menor; después el que lleva más tiempo sin lectura;
  // y a igualdad, por `lotId`, para que el orden sea determinista y no dependa de la consulta.
  return filas.sort((a, b) => {
    const g = ORDEN.indexOf(a.grupo) - ORDEN.indexOf(b.grupo);
    if (g !== 0) return g;
    if (a.puntaje !== b.puntaje) return b.puntaje - a.puntaje;
    const ta = a.ultimaLectura?.getTime() ?? 0;
    const tb = b.ultimaLectura?.getTime() ?? 0;
    if (ta !== tb) return ta - tb;
    return a.lotId.localeCompare(b.lotId);
  });
}

/** Los grupos de la cola que piden que alguien decida algo (§4.5: «qué pide decisión»). */
const PIDEN_DECISION = new Set<FilaDeAtencion["grupo"]>(["critico", "listo_para_decidir"]);

/**
 * Cuántos lotes piden decisión en cada etapa de la línea, calculado con la cola de cada fase.
 *
 * **Sólo dos etapas tienen cola**: la fermentación es la fase abierta del `proceso` y el `secado` es
 * el secado. Las demás no tienen una corrida que vigilar, así que no pueden pedir nada y no
 * aparecen (la línea lee un ausente como 0, que aquí sí es cierto: no hay cola de esa etapa).
 *
 * **La cola se calcula POR FASE, y por eso recibe las entradas separadas**: así «pide decisión» llega
 * a la etapa correcta aunque un lote tuviera las dos fases abiertas a la vez, y una prueba puede
 * darle entradas que ninguna base sembrada produce y comprobar que cada grupo cae en SU etapa.
 */
export function pidenDecisionPorEtapa(input: {
  readonly fermentacion: readonly EntradaDeLoteParaTablero[];
  readonly secado: readonly EntradaDeLoteParaTablero[];
  readonly desviacionesAbiertasPorLote: ReadonlyMap<string, number>;
  readonly ahora: Date;
}): Record<string, number> {
  const cuenta = (lotes: readonly EntradaDeLoteParaTablero[]) =>
    colaDeAtencion({ lotes, desviacionesAbiertasPorLote: input.desviacionesAbiertasPorLote, ahora: input.ahora }).filter(
      (f) => PIDEN_DECISION.has(f.grupo),
    ).length;
  return { proceso: cuenta(input.fermentacion), secado: cuenta(input.secado) };
}

/**
 * Una unidad del sitio **sin** su ocupación.
 *
 * `HechosDelEquipo` trae `enUso` ya derivado, y aquí se pide a propósito sin él: la ocupación la
 * decide esta función a partir de las corridas, en la MISMA pasada que cuenta las que no declaran
 * unidad y las que chocan. Con dos fuentes —un `enUso` que llega hecho y unas corridas que se
 * recorren— podrían discrepar, y el que discrepa en silencio es el que dice «libre».
 */
export type UnidadDelSitio = Omit<HechosDelEquipo, "enUso"> & {
  /** Sólo para rotular el mapa. **No interviene en ninguna clasificación.** */
  readonly nombre?: string | null;
};

/**
 * Una celda del mapa de unidades: la clasificación de UNA unidad, con su nombre.
 *
 * Sale de la MISMA pasada que los resúmenes (ver `ocupacionDelSitio`), no de una cuenta paralela
 * hecha por quien pinta: con dos cuentas podrían discrepar, y la que discrepa en silencio es la
 * que dice «libre». `motivos` trae **todos** los que aplican, igual que `clasificar`.
 */
export interface CeldaDelMapa {
  readonly id: string;
  readonly nombre: string | null;
  readonly libreYSano: boolean;
  readonly motivos: readonly MotivoNoDisponible[];
  /**
   * **Está ocupada y su lote no es visible para quien mira.** No es un motivo más —el motivo es
   * `EN_USO`, y es verdad— sino lo que el operario necesita saber para no buscar un lote que no va
   * a encontrar.
   *
   * La ficha de `PENDING_IMPLEMENTATIONS/015` lo llamaba «ocupación desconocida». Con el recuento
   * sin filtrar **no es desconocida**: se sabe que está ocupada, y lo único que falta es de qué
   * lote. Se nombra por lo que el dato sostiene.
   */
  readonly loteNoVisible: boolean;
}

/**
 * Cuántas corridas abiertas tiene UNA unidad, **contadas sin filtrar por lote**.
 *
 * **Por qué existe, medido:** las corridas del tablero se consultan con
 * `inputs.some.lot: lotWhere` —filtradas por lote visible—, así que una corrida sobre un lote que
 * quien mira no ve nunca llegaba aquí, y `enUso` salía `false`. «No me llegó ninguna corrida» se
 * presentaba como «la unidad está libre», y la capacidad visible se leía como capacidad disponible.
 *
 * **Es un recuento y nada más.** No trae el lote, ni su código, ni su fase: dice cuántas filas hay.
 * Así se deja de mentir sobre la capacidad sin enseñar nada que la visibilidad oculte.
 */
export interface OcupacionDeUnidad {
  readonly unidadId: string;
  readonly corridas: number;
}

/** Una corrida abierta, con lo que declara de su unidad. */
export interface CorridaAbierta {
  readonly equipmentId: string | null;
  readonly bedLocationId: string | null;
  /** El tanque nombrado a mano. **Nunca** se usa para asignar: ver `sinUnidadDeclarada`. */
  readonly vesselNote: string | null;
}

export interface Ocupacion {
  readonly tanques: ResumenDeDisponibilidad;
  readonly camas: ResumenDeDisponibilidad;
  /**
   * Corridas que no dicen en qué unidad están. **No se asignan a ninguna.**
   *
   * Asignarlas por el nombre de `vesselNote` haría parecer libre un tanque que no lo está, y
   * alguien le echaría cereza encima. Es el error caro, así que salen contadas y en voz alta.
   */
  readonly sinUnidadDeclarada: number;
  /**
   * Unidades con más de una corrida abierta: conflicto de datos, no doble ocupación.
   *
   * **Sale del recuento sin filtrar por lote**, no de lo visible: dos corridas en un tanque son un
   * conflicto aunque ninguno de sus dos lotes se vea, y contándolo sobre lo visible el conflicto
   * desaparecía junto con sus lotes.
   */
  readonly conflictos: readonly string[];
  /**
   * Unidades ocupadas **cuyo lote no es visible** para quien mira, ordenadas. Es el tercer estado
   * de `PENDING_IMPLEMENTATIONS/015`: ni «libre comprobada» ni «ocupada por algo que puedes abrir».
   */
  readonly ocupadasSinLoteVisible: readonly string[];
  /**
   * Corridas que nombran una unidad que no es de este sitio. No ocupan nada aquí y **no se
   * silencian**: contarlas como «sin unidad» mezclaría un dato incompleto con un filtro.
   */
  readonly ajenas: number;
  /** Cada unidad con su clasificación, en el orden recibido: lo que pinta el mapa. */
  readonly mapa: {
    readonly tanques: readonly CeldaDelMapa[];
    readonly camas: readonly CeldaDelMapa[];
  };
}

export function ocupacionDelSitio(input: {
  readonly tanques: readonly UnidadDelSitio[];
  readonly camas: readonly UnidadDelSitio[];
  /**
   * Corridas abiertas sobre lotes **visibles** para quien mira: las únicas de las que se sabe el
   * lote. Siguen diciendo qué está sin unidad declarada y qué nombra una unidad ajena.
   */
  readonly corridas: readonly CorridaAbierta[];
  /**
   * **Cuántas corridas abiertas hay por unidad, SIN filtrar por lote**, sobre las unidades
   * visibles. De aquí sale `enUso` y de aquí salen los conflictos. Ver `OcupacionDeUnidad`.
   */
  readonly corridasPorUnidad: readonly OcupacionDeUnidad[];
}): Ocupacion {
  const idsDeTanque = new Set(input.tanques.map((t) => t.id));
  const idsDeCama = new Set(input.camas.map((c) => c.id));

  // Lo visible, que es lo que tiene lote: sólo sirve para distinguir «ocupada» de «ocupada por un
  // lote que no ves», y para contar lo que no ocupa nada aquí.
  const conLoteVisible = new Map<string, number>();
  let sinUnidadDeclarada = 0;
  let ajenas = 0;

  for (const c of input.corridas) {
    const declarada = c.equipmentId ?? c.bedLocationId;
    if (declarada == null) {
      sinUnidadDeclarada += 1;
      continue;
    }
    if (!idsDeTanque.has(declarada) && !idsDeCama.has(declarada)) {
      ajenas += 1;
      continue;
    }
    conLoteVisible.set(declarada, (conLoteVisible.get(declarada) ?? 0) + 1);
  }

  // **La ocupación sale de aquí, no de las corridas visibles.** Una unidad que no aparece cuenta
  // como cero: el recuento cubre TODAS las unidades visibles, así que ausente es «ninguna corrida».
  const sinFiltro = new Map(input.corridasPorUnidad.map((o) => [o.unidadId, o.corridas] as const));
  const ocupada = (id: string) => (sinFiltro.get(id) ?? 0) > 0;

  // El mismo `clasificar` para las dos, no una regla paralela: así el tablero y `app/equipos`
  // dicen lo mismo del mismo tanque. Una unidad con dos corridas cuenta como UNA en uso — es una
  // unidad, con un problema de datos —, y el conflicto se dice aparte.
  const clasificarTodas = (us: readonly UnidadDelSitio[]): Clasificacion[] =>
    us.map((u) => clasificar({ ...u, enUso: ocupada(u.id) }));
  const celdas = (us: readonly UnidadDelSitio[], cs: readonly Clasificacion[]): CeldaDelMapa[] =>
    cs.map((c, i) => ({
      id: c.id,
      nombre: us[i]?.nombre ?? null,
      libreYSano: c.libreYSano,
      motivos: c.motivos,
      // Ocupada, y su lote no está entre los que esta cuenta puede ver.
      loteNoVisible: ocupada(c.id) && (conLoteVisible.get(c.id) ?? 0) === 0,
    }));
  const clasifTanques = clasificarTodas(input.tanques);
  const clasifCamas = clasificarTodas(input.camas);

  return {
    tanques: resumir(clasifTanques),
    camas: resumir(clasifCamas),
    mapa: { tanques: celdas(input.tanques, clasifTanques), camas: celdas(input.camas, clasifCamas) },
    sinUnidadDeclarada,
    conflictos: [...sinFiltro].filter(([, n]) => n > 1).map(([id]) => id).sort(),
    ajenas,
    ocupadasSinLoteVisible: [...clasifTanques, ...clasifCamas]
      .map((c) => c.id)
      .filter((id) => ocupada(id) && (conLoteVisible.get(id) ?? 0) === 0)
      .sort(),
  };
}

/** Lo único que el bloque de instrumentos lee de un equipo. */
export interface EquipoParaTablero {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly verificacion: EstadoDeVerificacion;
}

/**
 * Los instrumentos que piden que alguien vaya.
 *
 * Mismos estados que ya usa el veredicto del lote, así que el tablero y la ficha dicen lo mismo
 * del mismo potenciómetro. Un `VERIFICADO` no aparece: el bloque es una lista de trabajo, no un
 * inventario.
 *
 * **Y se filtra por `kind` además de por estado, aunque hoy sea redundante.** `listarEquipos`
 * pone `SIN_INSTRUMENTO` a todo lo que no es instrumento, así que el filtro de estado ya los
 * excluiría; el de `kind` es la red para el día que un importador o un cambio de `kind`
 * produzcan la combinación. Su prueba construye ese caso a mano, porque un guardia que la
 * entrada real no puede disparar no está probado.
 */
const PIDEN_ATENCION = new Set<EstadoDeVerificacion>([
  "REVISION_VENCIDA",
  "VERIFICACION_FALLIDA",
  "SIN_VERIFICACION",
]);

export function instrumentosQuePidenAtencion(
  equipos: readonly EquipoParaTablero[],
): readonly EquipoParaTablero[] {
  return equipos.filter((e) => e.kind === "instrument" && PIDEN_ATENCION.has(e.verificacion));
}

/**
 * **Los instrumentos que esta cuenta VE**, pidan o no atención
 * (`PENDING_IMPLEMENTATIONS/019`).
 *
 * Hace falta para distinguir «ninguno pide atención» de «no ves ninguno», que es el defecto de
 * 019(a): la pantalla decía lo primero sobre una lista vacía, y lo vacío puede ser que no haya
 * nada que mirar. `DatosDelTablero.instrumentos` lleva **todo el equipo visible** con su `kind`
 * —`datosDelTablero.ts:516` no filtra—, así que contar esa lista haría decir «ninguno pide
 * atención» a una cuenta que ve tanques y **cero instrumentos**: la misma mentira con otra cara.
 * Yo escribí esa versión y una de mis propias pruebas la daba por buena.
 *
 * El filtro de `kind` vive aquí, al lado del otro, para que la regla de qué cuenta como
 * instrumento esté en un solo sitio: duplicarla en la pantalla es cómo se pierde.
 */
export function instrumentosVisibles(
  equipos: readonly EquipoParaTablero[],
): readonly EquipoParaTablero[] {
  return equipos.filter((e) => e.kind === "instrument");
}
