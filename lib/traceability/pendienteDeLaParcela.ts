import type { EstadoDeProduccion } from "./estadoDeProduccion";
import { avisosDeTrampas, type ReglaParaAviso, type TrampaParaAviso } from "./pendienteDeTrampas";

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
  /** Trampas de broca de la parcela; ver `avisosDeTrampas`. */
  trampas: readonly TrampaParaAviso[];
  /** La regla de la finca. `null` = sin regla, y sin regla no hay avisos de trampas. */
  regla: ReglaParaAviso | null;
}

export type Aviso =
  | { tipo: "jornada_sin_cerrar"; fieldSessionId: string; startedAt: Date }
  | { tipo: "muestreo_vencido"; muestra: "suelo" | "foliar"; ultimo: string | null }
  | { tipo: "muestras_sin_resultado"; suelo: number; foliar: number }
  | { tipo: "sin_area" }
  | { tipo: "area_no_valida" }
  | { tipo: "siembras_sin_conteo"; n: number }
  | { tipo: "siembras_sin_marcar"; n: number }
  | { tipo: "trampa_por_revisar"; specimenId: string; trapNumber: number | null; diasDeRetraso: number }
  | { tipo: "trampa_con_lectura_alta"; specimenId: string; trapNumber: number | null; lectura: string; accion: string };

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

  tocaHacer.push(...avisosDeTrampas({ hoy: e.hoy, trampas: e.trampas, regla: e.regla }));

  if (e.areaHectares == null) faltaUnDato.push({ tipo: "sin_area" });
  // `!(x > 0)` y no `x <= 0`: con `NaN` la segunda es falsa y lo dejaría pasar.
  else if (!(e.areaHectares > 0)) faltaUnDato.push({ tipo: "area_no_valida" });

  const sinConteo = e.cohortesActivas.filter((c) => c.plantCount == null).length;
  if (sinConteo > 0) faltaUnDato.push({ tipo: "siembras_sin_conteo", n: sinConteo });

  const sinMarcar = e.cohortesActivas.filter((c) => e.estados.get(c.id)?.estado !== "en_produccion").length;
  if (sinMarcar > 0) faltaUnDato.push({ tipo: "siembras_sin_marcar", n: sinMarcar });

  return { tocaHacer, faltaUnDato };
}

export function enlaceDelAviso(aviso: Aviso, locationId: string): string {
  switch (aviso.tipo) {
    case "jornada_sin_cerrar":
      return `/field-sessions/${aviso.fieldSessionId}`;
    case "muestreo_vencido":
    case "muestras_sin_resultado":
      return `/plots/${locationId}?pestana=muestras`;
    case "sin_area":
    case "area_no_valida":
      return `/plots/${locationId}/ajustes#areaHectares`;
    case "siembras_sin_conteo":
    case "siembras_sin_marcar":
      return `/plots/${locationId}/ajustes#siembras`;
    case "trampa_por_revisar":
    case "trampa_con_lectura_alta":
      return `/plots/${locationId}?pestana=trampas`;
  }
}
