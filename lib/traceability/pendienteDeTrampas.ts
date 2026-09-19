import type { Aviso } from "./pendienteDeLaParcela";
import type { PlotBlockType } from "../../generated/prisma/client";

/**
 * Los avisos de las trampas de broca — spec de trampas §6.
 *
 * Pura, como `pendienteDeLaParcela`: recibe «hoy» ya calculado (`diaDeHoy`) y
 * las trampas ya leídas, y no consulta la base.
 *
 * **Sin regla no hay avisos**, por vencida que esté una trampa: no se inventa
 * el quincenal de ninguna guía. Y una regla sugiere, no actúa: el aviso de
 * lectura alta sólo lleva el texto de la acción que escribió el encargado.
 *
 * Las reglas miran la ESCALA, nunca el número de capturas.
 */
export type NivelDeBroca = "ninguno" | "pocos" | "algunos" | "muchos";

/** El orden de la escala: «disparó» es índice ≥ índice del disparador. */
const ESCALA: readonly NivelDeBroca[] = ["ninguno", "pocos", "algunos", "muchos"];

export interface TrampaParaAviso {
  id: string;
  trapNumber: number | null;
  bloque: { name: string; blockType: PlotBlockType | null } | null;
  status: "active" | "removed" | "dead";
  /**
   * `dia` es campo de día `YYYY-MM-DD` (la revisión se guarda a medianoche UTC).
   * `brocaLevel` nulo es una revisión vieja sin lectura: cuenta como visita
   * —el plazo corre desde su día— y como «no disparó». Descartarla movería el
   * plazo hacia atrás, a una revisión anterior o a la instalación.
   *
   * **F7 fix-final**: si `dia` es ANTERIOR a `instaladaEl`, `avisosDeTrampas`
   * la trata como si no existiera — es de un ciclo cerrado por un retiro y
   * reinstalación posteriores, y ni cuenta como visita ni puede disparar.
   */
  ultimaRevision: { dia: string; brocaLevel: NivelDeBroca | null } | null;
  /**
   * Día `YYYY-MM-DD` de la última observación `installed` O `reinstalled`
   * (lo que sea más reciente); `null` si no hay ninguna. Es la fecha de la
   * activación VIGENTE, no necesariamente la primera vez que se instaló.
   */
  instaladaEl: string | null;
}

export interface ReglaParaAviso {
  triggerLevel: NivelDeBroca;
  normalDays: number;
  alertDays: number;
  suggestedAction: string;
}

/**
 * Días de `desde` a `hasta`, dos cadenas `YYYY-MM-DD`. Con `Date.UTC` y sin
 * zona horaria: un día es un día, sin horario de verano que reste una hora.
 */
function diasEntre(desde: string, hasta: string): number {
  const utc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((utc(hasta) - utc(desde)) / 86_400_000);
}

/**
 * Si la última lectura disparó y desde cuándo corre el plazo — la parte de
 * `disparoYPlazo` que no depende de «hoy» (ver su docstring para por qué
 * las dos funciones existen). Extraída en la Tarea 9 (spec §4.2) para que
 * `proximaRevisionDe` pueda calcular la fecha límite sin repetir esta rama.
 *
 * F7 fix-final — una revisión de ANTES de la última instalación/
 * reinstalación es de un ciclo cerrado: ni cuenta como visita ni puede
 * disparar nada. Sin esto, retirar una trampa con una lectura alta y
 * reinstalarla meses después seguía proponiendo la acción de esa lectura
 * vieja, y el plazo corría desde ella en vez de desde la reinstalación.
 * Comparación de cadenas `YYYY-MM-DD`, válida porque son ISO.
 */
function plazoDeLaTrampa(
  trampa: TrampaParaAviso,
  regla: ReglaParaAviso,
): { desde: string | null; plazo: number; disparo: boolean; lectura: NivelDeBroca | null } {
  const disparador = ESCALA.indexOf(regla.triggerLevel);
  const revisionVigente =
    trampa.ultimaRevision != null &&
    (trampa.instaladaEl == null || trampa.ultimaRevision.dia >= trampa.instaladaEl)
      ? trampa.ultimaRevision
      : null;

  const lectura = revisionVigente?.brocaLevel ?? null;
  const disparo = lectura != null && ESCALA.indexOf(lectura) >= disparador;

  // Nunca revisada (o la única revisión es de antes de reinstalar): el
  // plazo corre desde la instalación/reinstalación. Sin eso y sin
  // instalación registrada no hay desde dónde contar, y no se inventa uno.
  const desde = revisionVigente?.dia ?? trampa.instaladaEl;
  const plazo = disparo ? regla.alertDays : regla.normalDays;
  return { desde, plazo, disparo, lectura };
}

/**
 * Añade «hoy» a `plazoDeLaTrampa` para dar `diasDeRetraso` — la única lógica
 * no trivial de este archivo, compartida por `avisosDeTrampas` y
 * `estadoDeTrampa`. Ruling del controlador sobre la Tarea 3
 * (2026-09-18-vistas-de-finca-y-parcela): el borrador de la tarea pedía
 * repetir esta rama en las dos funciones; en vez de eso vive aquí una sola
 * vez, y las dos la llaman.
 */
function disparoYPlazo(
  trampa: TrampaParaAviso,
  regla: ReglaParaAviso,
  hoy: string,
): { disparo: boolean; lectura: NivelDeBroca | null; diasDeRetraso: number | null } {
  const { desde, plazo, disparo, lectura } = plazoDeLaTrampa(trampa, regla);
  const diasDeRetraso = desde == null ? null : diasEntre(desde, hoy) - plazo;
  return { disparo, lectura, diasDeRetraso };
}

/**
 * Ida y vuelta de `diasEntre`: el día, `dias` después. Mismo truco de
 * `Date.UTC`, para que un día sea un día sin que el horario de verano reste
 * una hora.
 */
function sumarDias(desde: string, dias: number): string {
  const utc = Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, Number(desde.slice(8, 10)));
  return new Date(utc + dias * 86_400_000).toISOString().slice(0, 10);
}

/**
 * «próxima revisión: <fecha>» de la tarjeta de la ronda — spec §4.2. Comparte
 * `plazoDeLaTrampa` con `disparoYPlazo`: el mismo `desde` y el mismo plazo (el
 * de alerta si la última lectura disparó, si no el normal). **Sin regla no
 * hay valor por defecto** (ADR-080): se devuelve `null` y la pantalla no
 * muestra la línea, en vez de inventar un plazo.
 */
export function proximaRevisionDe(trampa: TrampaParaAviso, regla: ReglaParaAviso | null): string | null {
  if (regla == null) return null;
  const { desde, plazo } = plazoDeLaTrampa(trampa, regla);
  return desde == null ? null : sumarDias(desde, plazo);
}

export function avisosDeTrampas(e: {
  hoy: string;
  trampas: readonly TrampaParaAviso[];
  regla: ReglaParaAviso | null;
}): Aviso[] {
  const { regla } = e;
  if (regla == null) return [];

  const avisos: Aviso[] = [];
  for (const t of e.trampas) {
    // Una retirada o muerta no se revisa.
    if (t.status !== "active") continue;

    const { disparo, lectura, diasDeRetraso } = disparoYPlazo(t, regla, e.hoy);

    // El día exacto del vencimiento todavía no avisa: sólo un retraso > 0.
    if (diasDeRetraso != null && diasDeRetraso > 0) {
      avisos.push({ tipo: "trampa_por_revisar", specimenId: t.id, trapNumber: t.trapNumber, diasDeRetraso });
    }

    if (disparo) {
      avisos.push({
        tipo: "trampa_con_lectura_alta",
        specimenId: t.id,
        trapNumber: t.trapNumber,
        lectura: lectura!,
        accion: regla.suggestedAction,
      });
    }
  }
  return avisos;
}

export type EstadoDeTrampa = "retirada" | "sin_regla" | "al_dia" | "toca_revisar" | "lectura_alta";

/**
 * El estado de UNA trampa, para una tabla o una tarjeta — no la lista de avisos que
 * produce `avisosDeTrampas`. Comparte con ella `disparoYPlazo` (ver su docstring).
 *
 * Una trampa que no está activa es `retirada`, y una activa sin regla es `sin_regla`:
 * son razones distintas y la pantalla dice la verdadera (ADR-080), aunque ninguna de las
 * dos tenga plazo. Ruling del controlador, 2026-09-18.
 */
export function estadoDeTrampa(e: {
  hoy: string;
  trampa: TrampaParaAviso;
  regla: ReglaParaAviso | null;
}): { estado: EstadoDeTrampa; diasDeRetraso: number | null } {
  if (e.trampa.status !== "active") return { estado: "retirada", diasDeRetraso: null };
  if (e.regla == null) return { estado: "sin_regla", diasDeRetraso: null };

  const { disparo, diasDeRetraso } = disparoYPlazo(e.trampa, e.regla, e.hoy);
  if (disparo) return { estado: "lectura_alta", diasDeRetraso };
  if (diasDeRetraso != null && diasDeRetraso > 0) return { estado: "toca_revisar", diasDeRetraso };
  return { estado: "al_dia", diasDeRetraso };
}

/**
 * De las trampas que devuelve `getPlotDetail` a la entrada de `avisosDeTrampas`.
 *
 * Los dos días salen de campos de día (medianoche UTC), así que su día es
 * `toISOString().slice(0, 10)`, sin zona. Una revisión sin lectura NO se
 * descarta: pasa con `brocaLevel: null` (ver `TrampaParaAviso`).
 */
/**
 * Los dos filtros que ofrece `/finca/trampas` — spec §4.1. Fix round 1, Tarea 8
 * (vistas-de-finca-y-parcela).
 */
export const FILTROS_DE_TRAMPAS = ["toca_revisar", "lectura_alta"] as const;
export type FiltroDeTrampas = (typeof FILTROS_DE_TRAMPAS)[number];

/**
 * El filtro de `/finca/trampas`, pura. Recibe la lista ya con su `estado`
 * calculado (por `estadoDeTrampa`) y el valor crudo de `?filtro=`: un valor
 * vacío, ausente o desconocido no filtra nada y devuelve la lista entera — una
 * URL escrita a mano no debe poder vaciar la tabla en silencio.
 */
export function trampasFiltradas<T extends { estado: EstadoDeTrampa }>(
  trampas: readonly T[],
  filtro: string | null | undefined,
): T[] {
  if (filtro != null && (FILTROS_DE_TRAMPAS as readonly string[]).includes(filtro)) {
    return trampas.filter((t) => t.estado === filtro);
  }
  return [...trampas];
}

export function trampasParaAviso(
  trampas: readonly {
    id: string;
    trapNumber: number | null;
    bloque: { name: string; blockType: PlotBlockType | null } | null;
    status: TrampaParaAviso["status"];
    instaladaEl: Date | null;
    ultimaRevision: { observedAt: Date; brocaLevel: NivelDeBroca | null } | null;
  }[],
): TrampaParaAviso[] {
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  return trampas.map((t) => ({
    id: t.id,
    trapNumber: t.trapNumber,
    bloque: t.bloque,
    status: t.status,
    instaladaEl: t.instaladaEl == null ? null : dia(t.instaladaEl),
    ultimaRevision:
      t.ultimaRevision == null ? null : { dia: dia(t.ultimaRevision.observedAt), brocaLevel: t.ultimaRevision.brocaLevel },
  }));
}

/**
 * El orden de las tarjetas de la ronda, spec §4.2: primero las que tocan revisar
 * —vencidas y luego las de hoy—, después el resto, y dentro de cada grupo por número
 * de trampa. `lectura_alta` cuenta como «toca revisar» para este orden: las dos son
 * la misma urgencia, sólo cambia el texto.
 */
/**
 * Las tres franjas de la ronda, spec §4.2: 0 vencidas, 1 «toca hoy», 2 el resto.
 * «Toca hoy» —el día exacto del vencimiento— NO es un `estado` propio:
 * `estadoDeTrampa` lo codifica como `al_dia` con `diasDeRetraso === 0`
 * (ver su docstring, «el día exacto del vencimiento todavía no avisa»), así
 * que hay que mirar las dos cosas juntas para no confundirlo con una trampa
 * que aún le quedan días. Fix round 1 de revisión, Tarea 9: la versión
 * anterior sólo separaba «vencida» del resto y dejaba «toca hoy» mezclada
 * con «no vence en varios días» dentro del mismo grupo, ordenadas sólo por
 * número — ver el contraejemplo #9/#2 en la prueba.
 */
function franjaDeRonda(e: { estado: EstadoDeTrampa; diasDeRetraso: number | null }): 0 | 1 | 2 {
  if (e.estado === "toca_revisar" || e.estado === "lectura_alta") return 0;
  if (e.estado === "al_dia" && e.diasDeRetraso === 0) return 1;
  return 2;
}

export function ordenDeRonda<
  T extends { trapNumber: number | null; estadoActual: { estado: EstadoDeTrampa; diasDeRetraso: number | null } },
>(trampas: readonly T[]): T[] {
  return [...trampas].sort((a, b) => {
    const franjaA = franjaDeRonda(a.estadoActual);
    const franjaB = franjaDeRonda(b.estadoActual);
    if (franjaA !== franjaB) return franjaA - franjaB;
    if (franjaA === 0) {
      const diff = (b.estadoActual.diasDeRetraso ?? 0) - (a.estadoActual.diasDeRetraso ?? 0);
      if (diff !== 0) return diff;
    }
    return (a.trapNumber ?? 0) - (b.trapNumber ?? 0);
  });
}
