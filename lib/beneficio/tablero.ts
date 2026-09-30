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
import { clasificar, resumir, type HechosDelEquipo, type ResumenDeDisponibilidad } from "../equipos/disponibilidad";

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

/** Lo que el tablero necesita de un lote. Lo llena `datosDelTablero`. */
export interface EntradaDeLoteParaTablero {
  readonly lotId: string;
  readonly lotCode: string;
  /** El veredicto ya resuelto, o la razón por la que no lo hay. */
  readonly veredicto: VeredictoParaCola | SinVeredicto;
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

export function colaDeAtencion(input: {
  readonly lotes: readonly EntradaDeLoteParaTablero[];
  readonly desviacionesAbiertasPorLote: ReadonlyMap<string, number>;
  readonly ahora: Date;
}): readonly FilaDeAtencion[] {
  const filas: FilaDeAtencion[] = [];

  for (const lote of input.lotes) {
    // Sin fase abierta no hay nada que vigilar: el lote no es trabajo pendiente del beneficio.
    if (!lote.faseIniciada) continue;

    // El ritmo se calcula lote por lote y su error se captura AQUÍ. Un dato corrupto en uno no
    // puede dejar la página en blanco para los demás.
    let ritmo: EstadoDeRitmo | { error: string };
    try {
      ritmo = estadoDeRitmo({
        ahora: input.ahora,
        faseIniciada: lote.faseIniciada,
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

/**
 * Una unidad del sitio **sin** su ocupación.
 *
 * `HechosDelEquipo` trae `enUso` ya derivado, y aquí se pide a propósito sin él: la ocupación la
 * decide esta función a partir de las corridas, en la MISMA pasada que cuenta las que no declaran
 * unidad y las que chocan. Con dos fuentes —un `enUso` que llega hecho y unas corridas que se
 * recorren— podrían discrepar, y el que discrepa en silencio es el que dice «libre».
 */
export type UnidadDelSitio = Omit<HechosDelEquipo, "enUso">;

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
  /** Unidades con más de una corrida abierta: conflicto de datos, no doble ocupación. */
  readonly conflictos: readonly string[];
  /**
   * Corridas que nombran una unidad que no es de este sitio. No ocupan nada aquí y **no se
   * silencian**: contarlas como «sin unidad» mezclaría un dato incompleto con un filtro.
   */
  readonly ajenas: number;
}

export function ocupacionDelSitio(input: {
  readonly tanques: readonly UnidadDelSitio[];
  readonly camas: readonly UnidadDelSitio[];
  readonly corridas: readonly CorridaAbierta[];
}): Ocupacion {
  const idsDeTanque = new Set(input.tanques.map((t) => t.id));
  const idsDeCama = new Set(input.camas.map((c) => c.id));

  const cuenta = new Map<string, number>();
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
    cuenta.set(declarada, (cuenta.get(declarada) ?? 0) + 1);
  }

  // El mismo `clasificar` para las dos, no una regla paralela: así el tablero y `app/equipos`
  // dicen lo mismo del mismo tanque. Una unidad con dos corridas cuenta como UNA en uso — es una
  // unidad, con un problema de datos —, y el conflicto se dice aparte.
  const clasificarTodas = (us: readonly UnidadDelSitio[]) =>
    resumir(us.map((u) => clasificar({ ...u, enUso: (cuenta.get(u.id) ?? 0) > 0 })));

  return {
    tanques: clasificarTodas(input.tanques),
    camas: clasificarTodas(input.camas),
    sinUnidadDeclarada,
    conflictos: [...cuenta].filter(([, n]) => n > 1).map(([id]) => id).sort(),
    ajenas,
  };
}
