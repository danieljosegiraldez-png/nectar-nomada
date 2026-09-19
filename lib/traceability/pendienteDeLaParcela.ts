import type { EstadoDeProduccion } from "./estadoDeProduccion";
import { carenciaDeIntervencion, reentradaDeIntervencion, type IntervencionParaCarencia } from "./carenciaDeIntervencion";
import { avisosDeTrampas, type IntervencionQueCubre, type ReglaParaAviso, type TrampaParaAviso } from "./pendienteDeTrampas";

/**
 * Lo pendiente de una parcela — tablero de parcela, spec §4.
 *
 * Toma de `lib/apiary/pendienteDeLaVisita.ts` su disciplina: no recibe usuario,
 * no autoriza, y la llama la pantalla que ya pasó la compuerta
 * (`getPlotDetail`). **A diferencia de aquélla, es pura**: no consulta la base
 * y recibe «hoy» ya calculado (`diaDeHoy`), para probarla sin base y sin reloj.
 *
 * Sólo avisa de lo que sale de datos que YA existen. Lo que queda fuera, y por
 * qué, está en el spec §4.4. Lo que más tienta añadir: un plazo para los
 * resultados de laboratorio. No hay un plazo acordado, y no se inventa.
 */
/**
 * Ronda final, hallazgo 6: la intervención trae su PROPIO `locationId`, que no
 * siempre es el de la parcela que pide el tablero — `intervencionesVigentes`
 * reúne las de `ubicacionesEmparentadas`, así que una de la parcela MADRE
 * puede llegar aquí. El aviso lo conserva para que `enlaceDelAviso` enlace a
 * la ficha real (`/plots/<dueña>/manejo/<id>`), no a una búsqueda en la
 * parcela equivocada.
 */
export interface IntervencionParaAviso extends IntervencionParaCarencia {
  readonly locationId: string;
}

export interface EntradaDePendiente {
  /** Hoy como `YYYY-MM-DD`, de `diaDeHoy(ahora, location.timezone)`. */
  hoy: string;
  /**
   * `location.areaHectares`, pasado por `Number()` sólo si no es nulo. El aviso
   * de área sale de aquí y NO de `computePlotDensity`: ésa devuelve
   * `conteo_incompleto` antes de mirar el área, así que un lote sin área y con
   * una siembra sin conteo se quedaba sin su aviso.
   */
  areaHectares: number | null;
  cohortesActivas: readonly { id: string; plantCount: number | null }[];
  estados: ReadonlyMap<string, EstadoDeProduccion>;
  jornadas: readonly { id: string; startedAt: Date; endedAt: Date | null }[];
  /** `sampledAt` es campo de día (medianoche UTC); `resultados` = nº de Measurement. */
  muestrasDeSuelo: readonly { sampledAt: Date; resultados: number }[];
  muestrasFoliares: readonly { sampledAt: Date; resultados: number }[];
  /** El instante contra el que se mide la reentrada (spec §3.5) y la carencia. */
  ahora: Date;
  /** Ya reducidas por `ubicacionesEmparentadas` + `intervencionesVigentes`, spec §3.3/§4.1. */
  intervenciones: readonly IntervencionParaAviso[];
  /** Trampas de broca de la parcela; ver `avisosDeTrampas`. */
  trampas: readonly TrampaParaAviso[];
  /** La regla de la finca. `null` = sin regla, y sin regla no hay avisos de trampas. */
  regla: ReglaParaAviso | null;
  /**
   * Las intervenciones que pueden «atender» una trampa (spec §4.2) — vigentes
   * de esta MISMA parcela, no las de `intervenciones` (que incluye las
   * emparentadas, para carencia/reentrada). La página las filtra por
   * `locationId` antes de pasarlas.
   */
  intervencionesDeTrampas: readonly IntervencionQueCubre[];
}

export type Aviso =
  | { tipo: "jornada_sin_cerrar"; fieldSessionId: string; startedAt: Date }
  | { tipo: "muestreo_vencido"; muestra: "suelo" | "foliar"; ultimo: string | null }
  | { tipo: "muestras_sin_resultado"; suelo: number; foliar: number }
  | { tipo: "sin_area" }
  | { tipo: "area_no_valida" }
  | { tipo: "siembras_sin_conteo"; n: number }
  | { tipo: "siembras_sin_marcar"; n: number }
  | { tipo: "reentrada_vigente"; interventionId: string; locationId: string; hasta: Date }
  | { tipo: "carencia_vigente"; interventionId: string; locationId: string; hasta: Date; dias: number }
  | { tipo: "carencia_no_declarada"; interventionId: string; locationId: string; alMenosHasta: Date | null }
  | { tipo: "reentrada_no_declarada"; interventionId: string; locationId: string; alMenosHasta: Date | null }
  | { tipo: "trampa_por_revisar"; specimenId: string; trapNumber: number | null; diasDeRetraso: number }
  | {
      tipo: "trampa_con_lectura_alta";
      specimenId: string;
      trapNumber: number | null;
      lectura: string;
      accion: string;
      observationId: string;
      plotBlockId: string | null;
      materialId: string | null;
      materialName: string | null;
    };

/** Mismo día y mes del año siguiente; un 29 de febrero vence el 28. */
export function venceElMuestreo(ultimoDia: string): string {
  const anio = Number(ultimoDia.slice(0, 4)) + 1;
  const mesDia = ultimoDia.slice(5) === "02-29" ? "02-28" : ultimoDia.slice(5);
  return `${anio}-${mesDia}`;
}

function ultimoDia(muestras: readonly { sampledAt: Date }[]): string | null {
  if (muestras.length === 0) return null;
  // Campo de día: su ISO en UTC ES el día. Nunca con desfase horario.
  return muestras.map((m) => m.sampledAt.toISOString().slice(0, 10)).reduce((a, b) => (b > a ? b : a));
}

export function pendienteDeLaParcela(e: EntradaDePendiente): { tocaHacer: Aviso[]; faltaUnDato: Aviso[] } {
  const tocaHacer: Aviso[] = [];
  const faltaUnDato: Aviso[] = [];

  for (const j of e.jornadas) {
    if (j.endedAt == null) tocaHacer.push({ tipo: "jornada_sin_cerrar", fieldSessionId: j.id, startedAt: j.startedAt });
  }

  for (const [muestra, lista] of [
    ["suelo", e.muestrasDeSuelo],
    ["foliar", e.muestrasFoliares],
  ] as const) {
    const ultimo = ultimoDia(lista);
    // Comparación de cadenas `YYYY-MM-DD`: el orden léxico es el cronológico.
    if (ultimo == null || e.hoy >= venceElMuestreo(ultimo)) {
      tocaHacer.push({ tipo: "muestreo_vencido", muestra, ultimo });
    }
  }

  const sueloSinResultado = e.muestrasDeSuelo.filter((m) => m.resultados === 0).length;
  const foliarSinResultado = e.muestrasFoliares.filter((m) => m.resultados === 0).length;
  if (sueloSinResultado + foliarSinResultado > 0) {
    tocaHacer.push({ tipo: "muestras_sin_resultado", suelo: sueloSinResultado, foliar: foliarSinResultado });
  }

  tocaHacer.push(...avisosDeTrampas({ hoy: e.hoy, trampas: e.trampas, regla: e.regla, intervenciones: e.intervencionesDeTrampas }));

  if (e.areaHectares == null) faltaUnDato.push({ tipo: "sin_area" });
  // `!(x > 0)` y no `x <= 0`: con `NaN` la segunda es falsa y lo dejaría pasar.
  else if (!(e.areaHectares > 0)) faltaUnDato.push({ tipo: "area_no_valida" });

  const sinConteo = e.cohortesActivas.filter((c) => c.plantCount == null).length;
  if (sinConteo > 0) faltaUnDato.push({ tipo: "siembras_sin_conteo", n: sinConteo });

  const sinMarcar = e.cohortesActivas.filter((c) => e.estados.get(c.id)?.estado !== "en_produccion").length;
  if (sinMarcar > 0) faltaUnDato.push({ tipo: "siembras_sin_marcar", n: sinMarcar });

  for (const i of e.intervenciones) {
    const re = reentradaDeIntervencion(i, e.ahora);
    if (re.estado === "vigente") tocaHacer.push({ tipo: "reentrada_vigente", interventionId: i.id, locationId: i.locationId, hasta: re.libreDesde });
    if (re.estado === "desconocida") faltaUnDato.push({ tipo: "reentrada_no_declarada", interventionId: i.id, locationId: i.locationId, alMenosHasta: re.alMenosHasta });
    const ca = carenciaDeIntervencion(i, e.ahora);
    if (ca.estado === "conocida") tocaHacer.push({ tipo: "carencia_vigente", interventionId: i.id, locationId: i.locationId, hasta: ca.libreDesde, dias: ca.diasQueFaltan });
    if (ca.estado === "desconocida") faltaUnDato.push({ tipo: "carencia_no_declarada", interventionId: i.id, locationId: i.locationId, alMenosHasta: ca.alMenosHasta });
  }

  return { tocaHacer, faltaUnDato };
}

export function enlaceDelAviso(aviso: Aviso, locationId: string): string {
  switch (aviso.tipo) {
    case "jornada_sin_cerrar":
      return `/field-sessions/${aviso.fieldSessionId}`;
    case "muestreo_vencido":
    case "muestras_sin_resultado":
      return `/plots/${locationId}#muestras`;
    case "sin_area":
    case "area_no_valida":
      return `/plots/${locationId}/ajustes#areaHectares`;
    case "siembras_sin_conteo":
    case "siembras_sin_marcar":
      return `/plots/${locationId}/ajustes#siembras`;
    case "reentrada_vigente":
    case "carencia_vigente":
    case "carencia_no_declarada":
    case "reentrada_no_declarada":
      // Ronda final, hallazgo 6: la DUEÑA de la intervención, no la parcela
      // que muestra el aviso — una intervención heredada de la parcela madre
      // vive en `/plots/<madre>/manejo/<id>`, y `listarIntervenciones` de una
      // microparcela nunca la encuentra.
      return `/plots/${aviso.locationId}/manejo/${aviso.interventionId}`;
    case "trampa_por_revisar":
    case "trampa_con_lectura_alta":
      return `/plots/${locationId}#trampas`;
  }
}

/**
 * El botón «Registrar aplicación» de un aviso de lectura alta — PR B tarea 5,
 * decisión del controlador #4. Distinto de `enlaceDelAviso`, que sigue
 * llevando a `#trampas`: éste abre el formulario de manejo con lo que ya se
 * sabe precargado. Sólo `motivo` es seguro (la observación que disparó el
 * aviso siempre existe); `bloque` y `material` se omiten si son nulos — el
 * formulario no pinta un parámetro vacío como si fuera una elección.
 */
export function enlaceDeRegistrarAplicacion(
  aviso: Extract<Aviso, { tipo: "trampa_con_lectura_alta" }>,
  locationId: string,
): string {
  const params = new URLSearchParams({ motivo: aviso.observationId });
  if (aviso.plotBlockId != null) params.set("bloque", aviso.plotBlockId);
  if (aviso.materialId != null) params.set("material", aviso.materialId);
  return `/plots/${locationId}/manejo/nuevo?${params.toString()}`;
}
