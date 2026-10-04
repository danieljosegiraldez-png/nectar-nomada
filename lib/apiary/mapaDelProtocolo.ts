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
 * ## La mitad que faltaba, y me costo una entrada falsa
 *
 * El guardia comprobaba que **los destinos declarados existan**, y con eso creia que el mapa no
 * podia mentir. Podia, en la otra direccion: **un `sin_sitio` era una afirmacion que nada
 * verificaba**. Declare `efficacy_note` sin sitio el 2026-09-15 y resulta que
 * `ColonyEvent.treatmentEfficacyNote` existe desde A9.4 **y el cierre de tratamiento lo
 * escribe** -- o sea que la cuenta de huecos que publique era mas grande que la real.
 *
 * Desde hoy el guardia tambien mira al reves: para cada `sin_sitio` comprueba que **ningun
 * campo de los modelos de esa actividad se parezca a la clave**. No es infalible -- es una
 * heuristica sobre nombres -- pero habria cazado esta, y una falsa alarma se resuelve
 * declarando el destino, que es lo que habia que hacer de todos modos.
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

/**
 * A que modelos escribe cada actividad del protocolo. Lo usa el guardia para poder comprobar
 * un `sin_sitio`: sin saber donde buscar, "no tiene sitio" no se puede contradecir.
 */
export const MODELOS_POR_ACTIVIDAD: Record<string, string[]> = {
  visit: ["FieldSession"],
  inspection: ["Inspection", "VarroaCount", "InspectionIrregularity"],
  feeding: ["ColonyEvent"],
  treatment: ["ColonyEvent"],
  harvest: ["ApiaryHarvestEvent"],
};

export const MAPA_DEL_PROTOCOLO: Record<string, DestinoDelItem> = {
  // --- visit: la visita al sitio -------------------------------------------------------
  purpose: { clase: "campo", modelo: "FieldSession", campo: "purposes" },
  // CORRIGE la nota anterior, que confundia dos preguntas (ADR-152). Decia: "el Anexo C lo
  // pide como vital del sitio y lo deja en una capa externa sin proveedor conectado". Eso es
  // cierto del "Clima 7 dias" del Anexo C --un PRONOSTICO--, y falso de esta: el Anexo E
  // pregunta lo que el apicultor VIO estando ahi, y su vocabulario ya estaba en el protocolo.
  weather_observed: { clase: "campo", modelo: "FieldSession", campo: "weatherObserved" },
  // ADR-165: lista fija desde la v2 del protocolo (era una línea de texto en la v1).
  site_condition: { clase: "campo", modelo: "FieldSession", campo: "siteConditions" },
  colonies_alive_count: { clase: "campo", modelo: "FieldSession", campo: "coloniesAliveCount" },
  // Ya tiene sitio (ADR-150). La nota anterior decia la razon por la que faltaba --"contar y
  // declarar son datos distintos: el segundo es lo que alguien vio"-- y esa razon es justo la
  // que la construyo. La cuenta del sistema NO desaparece: `compararCajasPresentes` las junta.
  hives_present_count: { clase: "campo", modelo: "FieldSession", campo: "hivesPresentCount" },
  travel_cost_usd: { clase: "campo", modelo: "FieldSession", campo: "travelCostUsd" },
  next_visit_due_at: { clase: "campo", modelo: "FieldSession", campo: "nextVisitDueAt" },
  probable_cause: { clase: "campo", modelo: "FieldSession", campo: "probableCause" },
  recommendation: { clase: "campo", modelo: "FieldSession", campo: "recommendation" },

  // --- inspection: la inspeccion de colonia ---------------------------------------------
  outcome: { clase: "campo", modelo: "Inspection", campo: "outcome" },
  queen_sighted: { clase: "campo", modelo: "Inspection", campo: "queenSighted" },
  brood_pattern: { clase: "campo", modelo: "Inspection", campo: "broodPattern" },
  brood_stages: { clase: "campo", modelo: "Inspection", campo: "broodStages" },
  population: { clase: "campo", modelo: "Inspection", campo: "population" },
  frames_covered: { clase: "campo", modelo: "Inspection", campo: "beeCoveredFrames" },
  queen_cells: { clase: "campo", modelo: "Inspection", campo: "queenCellKind" },
  queen_cells_count: { clase: "campo", modelo: "Inspection", campo: "queenCellCount" },
  honey_stores: { clase: "campo", modelo: "Inspection", campo: "honeyStoresLevel" },
  // **El sitio de «junto a la cría», que no es un nivel más** (ADR-117,
  // `PENDING_IMPLEMENTATIONS/010`). El protocolo lo ofrecía como cuarta opción de la escala, y en
  // la misma lista impide decir «alta Y junto a la cría»; ahora es su propia pregunta y su propia
  // columna, que ya existían y no tenían nada que las escribiera.
  honey_next_to_brood: { clase: "campo", modelo: "Inspection", campo: "honeyNextToBrood" },
  pollen_stores: { clase: "campo", modelo: "Inspection", campo: "pollenStoresLevel" },
  pollen_next_to_brood: { clase: "campo", modelo: "Inspection", campo: "pollenNextToBrood" },
  // Anexo B §2.2, con su motivo escrito: «señal de obrera ponedora si aparece sin reina». El JSON
  // tenía los otros seis campos de esa sección y no ésta, y la columna llevaba ahí sin escritor.
  drone_brood_present: { clase: "campo", modelo: "Inspection", campo: "droneBroodPresent" },
  temperament: { clase: "campo", modelo: "Inspection", campo: "temperament" },
  irregularities: { clase: "tabla", modelo: "InspectionIrregularity", nota: "Una fila por irregularidad observada: son varias a la vez y por eso no es una columna." },
  // **Anexo B §2.4, y aterrizan en `Hive` y no en `Inspection`** porque lo dice el propio Anexo:
  // «cambia poco entre visitas, así que se guarda EN LA COLMENA y en la inspección sólo se
  // registra la diferencia. Preguntarlo cada vez es coste sin información». Por eso los siete
  // llevan `prefillLastUsed`, que es cómo este protocolo modela «sólo si cambió».
  //
  // `frames_per_box` va en etapa `close` por la regla de corte del propio archivo —«si se puede
  // escribir en el carro, `stage` es `close`»— y el Anexo dice lo mismo de ese campo.
  brood_boxes: { clase: "campo", modelo: "Hive", campo: "broodBoxes" },
  supers: { clase: "campo", modelo: "Hive", campo: "supers" },
  frames_per_box: { clase: "campo", modelo: "Hive", campo: "framesPerBox" },
  queen_excluder: { clase: "campo", modelo: "Hive", campo: "queenExcluder" },
  feeder_type: { clase: "campo", modelo: "Hive", campo: "feederType" },
  entrance_reducer: { clase: "campo", modelo: "Hive", campo: "entranceReducer" },
  screened_bottom_board: { clase: "campo", modelo: "Hive", campo: "screenedBottomBoard" },
  varroa_method: { clase: "campo", modelo: "VarroaCount", campo: "method" },
  varroa_bees_sampled: { clase: "campo", modelo: "VarroaCount", campo: "sampleBees" },
  varroa_mites_counted: { clase: "campo", modelo: "VarroaCount", campo: "mitesCounted" },
  note: { clase: "campo", modelo: "Inspection", campo: "note" },
  // Ya tiene sitio (ADR-154). La nota anterior decia la razon --«`note` es la nota de campo;
  // mezclarlas perderia cual se escribio con el guante puesto»-- y esa razon es la que la
  // construyo: son dos columnas porque son dos momentos.
  assessment: { clase: "campo", modelo: "Inspection", campo: "assessment" },

  // --- feeding: la alimentacion -----------------------------------------------------------
  // Apunta al VOCABULARIO, no al texto (ADR-148). `feedingMaterial` sigue existiendo como el
  // «cual» de `otro`, pero la pregunta del protocolo --«con que»-- la contesta el enum: si el
  // mapa siguiera apuntando al texto, diria que esta capturada una pregunta que en la practica
  // se responde con un desplegable.
  material: { clase: "campo", modelo: "ColonyEvent", campo: "feedingMaterialKind" },
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
  efficacy_note: { clase: "campo", modelo: "ColonyEvent", campo: "treatmentEfficacyNote" },

  // --- harvest: la cosecha ----------------------------------------------------------------
  frames_harvested: { clase: "campo", modelo: "ApiaryHarvestEvent", campo: "framesHarvested" },
  extracted_weight_kg: { clase: "campo", modelo: "ApiaryHarvestEvent", campo: "extractedWeightKg" },
  honey_type: { clase: "campo", modelo: "ApiaryHarvestEvent", campo: "honeyType" },
  // ADR-160: la escala H% del refractometro de miel, como `Measurement` (variable `moisture`)
  // sobre el `Lot` que la cosecha produce -- no una columna: el lote es lo que sigue a la miel.
  moisture_pct: {
    clase: "tabla",
    modelo: "Measurement",
    nota: "variable `moisture` sobre el Lot de miel de la cosecha (`resultingLotId`), con su instrumento y modo. `registrarLecturaDeRefractometro`.",
  },
};

/** Los items que hoy no tienen donde guardarse. La lista corta que decide el proximo trabajo. */
export function itemsSinSitio(): string[] {
  return Object.entries(MAPA_DEL_PROTOCOLO)
    .filter(([, d]) => d.clase === "sin_sitio")
    .map(([k]) => k);
}
