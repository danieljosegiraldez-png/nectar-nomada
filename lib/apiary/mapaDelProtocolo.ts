/**
 * Donde aterriza cada una de las 44 preguntas del protocolo de campo -- y cuales no aterrizan.
 *
 * ## Por que existe
 *
 * El protocolo del dueno (`protocolos/apiario-campo-v1.json`, A9.4/D2) y el esquema son **dos
 * vocabularios sin traduccion entre ellos**. El protocolo dice `frames_covered`; la tabla dice
 * `beeCoveredFrames`. Sin un mapa declarado, la pregunta "cuantas de las 44 puede capturar el
 * sistema hoy" **no la puede contestar nadie** -- y medida a ojo, con los nombres, da una cifra
 * inventada: el primer intento dio "29 sin campo" y la mitad de esos 29 existen con otro
 * nombre. El instrumento estaba midiendo mi suposicion sobre los nombres, no el sistema.
 *
 * Asi que el mapa se **declara**, y un guardia comprueba dos cosas contra el modelo real:
 * que ningun item del JSON se quede sin entrada, y que **ningun destino declarado sea
 * inventado** -- el modelo y el campo tienen que existir en el esquema de Prisma.
 *
 * Es la misma forma que el inventario de acceso: cuando no se puede ver lo que hay, se declara
 * y se vigila que la declaracion no derive.
 *
 * ## Lo que este mapa NO dice
 *
 * Que la pregunta se pueda **responder desde un formulario**. Dice que el dato tiene sitio
 * donde guardarse. Un campo que existe en la tabla y que ningun formulario ofrece sigue siendo
 * un dato que nadie puede escribir -- esa es la otra mitad, y se mide aparte.
 */

/** Donde aterriza un item: un campo de un modelo, una tabla propia, o ningun sitio todavia. */
export type DestinoDelItem =
  | { clase: "campo"; modelo: string; campo: string }
  | { clase: "tabla"; modelo: string; nota: string }
  | { clase: "sin_sitio"; nota: string };

export const MAPA_DEL_PROTOCOLO: Record<string, DestinoDelItem> = {
  // --- visit: la visita al sitio -------------------------------------------------------
  purpose: { clase: "sin_sitio", nota: "El proposito de la visita no tiene columna ni catalogo. `FieldSession.notes` es texto libre de la visita entera: meterlo ahi seria perder la pregunta." },
  weather_observed: { clase: "sin_sitio", nota: "Sin columna. El Anexo C lo pide como vital del sitio y lo deja en una capa externa sin proveedor conectado." },
  site_condition: { clase: "sin_sitio", nota: "Sin columna propia." },
  colonies_alive_count: { clase: "campo", modelo: "FieldSession", campo: "coloniesAliveCount" },
  hives_present_count: { clase: "sin_sitio", nota: "Las cajas presentes se cuentan hoy desde `Hive`, no se declaran. Contar y declarar son datos distintos: el segundo es lo que alguien vio." },
  travel_cost_usd: { clase: "sin_sitio", nota: "Los costos NO tienen modelo en todo el esquema -- `LabourEntry` no lleva ninguno. Y el snapshot del reporte los excluye a proposito (ADR-139). Es hueco conocido." },
  next_visit_due_at: { clase: "campo", modelo: "FieldSession", campo: "nextVisitDueAt" },
  probable_cause: { clase: "sin_sitio", nota: "La causa probable de lo observado en la visita. Distinta de `ColonyLossCause`, que es la causa del FIN de una colonia y si tiene tabla." },
  recommendation: { clase: "sin_sitio", nota: "La recomendacion al cliente. Es `stage: close`: se escribe en casa, y hoy no hay donde." },

  // --- inspection: la inspeccion de colonia ---------------------------------------------
  outcome: { clase: "campo", modelo: "Inspection", campo: "outcome" },
  queen_sighted: { clase: "campo", modelo: "Inspection", campo: "queenSighted" },
  brood_pattern: { clase: "campo", modelo: "Inspection", campo: "broodPatternNote" },
  brood_stages: { clase: "campo", modelo: "Inspection", campo: "broodStages" },
  population: { clase: "campo", modelo: "Inspection", campo: "population" },
  frames_covered: { clase: "campo", modelo: "Inspection", campo: "beeCoveredFrames" },
  queen_cells: { clase: "campo", modelo: "Inspection", campo: "queenCellKind" },
  queen_cells_count: { clase: "campo", modelo: "Inspection", campo: "queenCellCount" },
  honey_stores: { clase: "campo", modelo: "Inspection", campo: "honeyStoresLevel" },
  pollen_stores: { clase: "campo", modelo: "Inspection", campo: "pollenStoresLevel" },
  temperament: { clase: "campo", modelo: "Inspection", campo: "temperamentNote" },
  irregularities: { clase: "tabla", modelo: "InspectionIrregularity", nota: "Una fila por irregularidad observada: son varias a la vez y por eso no es una columna." },
  varroa_method: { clase: "campo", modelo: "VarroaCount", campo: "method" },
  varroa_bees_sampled: { clase: "campo", modelo: "VarroaCount", campo: "sampleBees" },
  varroa_mites_counted: { clase: "campo", modelo: "VarroaCount", campo: "mitesCounted" },
  note: { clase: "campo", modelo: "Inspection", campo: "note" },
  assessment: { clase: "sin_sitio", nota: "La valoracion de la inspeccion, `stage: close`. `note` es la nota de campo; mezclarlas perderia cual se escribio con el guante puesto." },

  // --- feeding: la alimentacion -----------------------------------------------------------
  material: { clase: "campo", modelo: "ColonyEvent", campo: "feedingMaterial" },
  quantity: { clase: "campo", modelo: "ColonyEvent", campo: "feedingQuantity" },
  unit: { clase: "campo", modelo: "ColonyEvent", campo: "feedingUnit" },
  method: { clase: "campo", modelo: "ColonyEvent", campo: "feedingMethod" },
  coverage_until: { clase: "campo", modelo: "ColonyEvent", campo: "coverageUntil" },

  // --- treatment: la aplicacion fitosanitaria ---------------------------------------------
  product: { clase: "campo", modelo: "ColonyEvent", campo: "treatmentProduct" },
  batch_label: { clase: "campo", modelo: "ColonyEvent", campo: "treatmentBatchLabel" },
  dose: { clase: "campo", modelo: "ColonyEvent", campo: "treatmentDose" },
  dose_unit: { clase: "campo", modelo: "ColonyEvent", campo: "treatmentDoseUnit" },
  target: { clase: "campo", modelo: "ColonyEvent", campo: "treatmentTarget" },
  route: { clase: "campo", modelo: "ColonyEvent", campo: "treatmentRoute" },
  withdrawal_days: { clase: "campo", modelo: "ColonyEvent", campo: "treatmentWithdrawalDays" },
  removal_date: { clase: "campo", modelo: "ColonyEvent", campo: "treatmentRemovalDate" },
  efficacy_note: { clase: "sin_sitio", nota: "La eficacia observada del tratamiento, `stage: close`. El Anexo B §4 pide agrupar por objetivo y esto es lo que haria legible esa agrupacion." },

  // --- harvest: la cosecha ----------------------------------------------------------------
  frames_harvested: { clase: "campo", modelo: "ApiaryHarvestEvent", campo: "framesHarvested" },
  extracted_weight_kg: { clase: "campo", modelo: "ApiaryHarvestEvent", campo: "extractedWeightKg" },
  honey_type: { clase: "campo", modelo: "ApiaryHarvestEvent", campo: "honeyType" },
  moisture_pct: { clase: "sin_sitio", nota: "La humedad de la miel, `stage: close`. El Anexo E §4 la marca «si se midio»." },
};

/** Los items que hoy no tienen donde guardarse. La lista corta que decide el proximo trabajo. */
export function itemsSinSitio(): string[] {
  return Object.entries(MAPA_DEL_PROTOCOLO)
    .filter(([, d]) => d.clase === "sin_sitio")
    .map(([k]) => k);
}
