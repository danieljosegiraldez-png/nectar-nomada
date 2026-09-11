/**
 * Phase 1, ticket T3 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §10.3, §11). Canonical unit registry — one definition per variable, every
 * write path normalizes into it before persistence (§11's normalization
 * discipline, reused from EXTERNAL_DATA_ARCHITECTURE.md §14). Weight is
 * deliberately absent: it's routed through QuantityEvent (§9), not
 * Measurement. Only temperature has a real-world alternate entry unit
 * (Fahrenheit) — every other Phase 1 variable's source and canonical unit
 * are always the same, so no conversion table is added speculatively for
 * them (§11's bias against premature structure).
 *
 * RO1.2 (36_RO1.2_METODOS_FERMENTACION.md §1a/§2) additions below follow
 * this same "no schema migration, only a registry entry" discipline —
 * CLAUDE.md's own stated rule for adding a measurable variable. Every
 * §2 field that's a genuinely NEW physical quantity is here; a field that's
 * boolean, free text, or a fixed choice among a few named options is
 * NOT — those go through the existing ProtocolVariable(boolean/text/
 * catalog-typed) + TreatmentBatchVariableValue mechanism instead (§3a),
 * same reasoning as the 6 new orthogonal-dimension catalogs in
 * lib/research/catalogs.ts. A field that's the same physical quantity as
 * an existing variable but at a distinct, independently-queryable moment
 * (cold hold's six temperature checkpoints) gets its own variable name —
 * same principle as `wash_medium_*` distinguishing "the medium's own
 * reading" from "the batch's own reading" without a new schema field, and
 * as R1's roastSessionId precedent ("no new field needed — the presence
 * of [a distinguishing signal] already says [which moment] unambiguously").
 * A field that's the SAME concept repeated over time (thermal-shock
 * cycles) reuses one variable across multiple Measurement rows, one per
 * occurrence — no "cycle count" field either: it's the count of rows,
 * derivable, not stored twice (same "don't store what the DAG/rows already
 * express" reasoning §2's own "Multi-etapa" entry states explicitly).
 */
export type MeasurementVariable =
  | "temperature"
  | "ph"
  | "brix"
  | "relative_humidity"
  | "moisture"
  | "water_activity"
  // §1a — water as a measurable input, both absolute volume and the
  // agua-a-café ratio that makes lots of different size comparable.
  | "water_volume_pulping"
  | "water_volume_washing"
  | "water_to_coffee_ratio"
  // §1a — the wash medium's own state (quantity + pH/Brix/temperature),
  // distinct variables from the cherry/lot's own readings above even
  // though they're physically the same kind of measurement — the medium
  // can be as experimentally relevant as the coffee itself.
  | "wash_medium_volume"
  | "wash_medium_ph"
  | "wash_medium_brix"
  | "wash_medium_temperature"
  // §2 Cold hold prefermentativo (CryoBloom) — taken verbatim from the
  // product owner's own reference card, not invented (§3's copyright rule).
  | "cold_hold_initial_temperature"
  | "cold_hold_target_temperature_min"
  | "cold_hold_target_temperature_max"
  | "cold_hold_descent_rate"
  | "cold_hold_plateau_duration"
  | "bioprotective_yeast_dose"
  | "rehydration_time"
  | "cold_hold_pre_seal_temperature"
  | "cold_hold_arrival_temperature"
  | "cold_hold_post_rinse_temperature"
  // §2 Choque térmico — one Measurement row per cycle (occurredAt marks
  // which cycle); "cantidad de ciclos" is the row count, not a field.
  | "thermal_shock_cycle_duration"
  | "thermal_shock_cutoff_temperature"
  // §2 Choque en frío — a single descent, distinct from cold hold's
  // sustained plateau and from choque térmico's repeated cycles.
  | "cold_shock_start_temperature"
  | "cold_shock_end_temperature"
  | "cold_shock_descent_duration"
  // §2 Fermentación fría en río/quebrada.
  | "river_water_temperature"
  | "submersion_depth"
  // §2 Maceración carbónica / Anaeróbico — shared: both are a sealed
  // vessel's internal pressure, whether from CO₂ specifically (carbónica)
  // or unspecified sealed-vessel gas (anaeróbico) — one variable, not two,
  // since the ticket doesn't distinguish the gas for anaeróbico's reading.
  | "vessel_pressure"
  // §2 Fermentación láctica.
  | "brine_concentration"
  // §2 Co-fermentación — "la divulgación importa": what was added is a
  // required free-text field (service layer), quantity is this variable.
  | "co_ferment_quantity"
  // §2 Koji.
  | "koji_propagation_duration"
  // S1 (45_S1_SUELO_AMBIENTE_TAZA.md §2) — la Tabla 7 del marco de
  // investigación: la caracterización de un lote de biochar. Entran aquí y no
  // en un registro aparte porque son exactamente lo que este registro es —una
  // magnitud física con unidad canónica y límites—, y porque `Measurement` ya
  // sabe superseder una corrección sin borrar la original.
  //
  // `ph` y `moisture` NO se repiten: son la misma magnitud física que ya está
  // arriba, y lo que distingue «el pH de este biochar» de «el pH de este lote
  // de café» es el sujeto de la fila, no el nombre de la variable. Es el
  // precedente que este archivo ya cita para `roastSessionId`.
  | "electrical_conductivity"
  | "ash_content"
  | "total_carbon"
  | "total_nitrogen"
  | "carbon_nitrogen_ratio"
  | "phosphorus"
  | "potassium"
  | "calcium"
  | "magnesium"
  | "iron"
  | "manganese"
  | "zinc"
  | "copper"
  | "boron"
  // S1 §2 (semanas 6–10) — la Tabla 3 del marco: el panel de química de suelo
  // base. Lo que no aparece aquí es porque ya estaba arriba: `ph` (en agua),
  // `electrical_conductivity`, `total_carbon`, `total_nitrogen`,
  // `carbon_nitrogen_ratio`, `phosphorus` y los micronutrientes.
  //
  // Los cationes intercambiables SÍ son variables propias y no las de arriba:
  // se reportan en cmol/kg, que son equivalentes de carga, no masa. Pasar de
  // mg/kg a cmol/kg exige peso atómico y valencia — es química, no conversión
  // de unidad, y fingir lo segundo produciría números falsos con aspecto de
  // buenos.
  | "ph_kcl"
  | "organic_matter"
  | "cec"
  | "effective_cec"
  | "exchangeable_acidity"
  | "exchangeable_aluminium"
  | "aluminium_saturation"
  | "base_saturation"
  | "exchangeable_potassium"
  | "exchangeable_calcium"
  | "exchangeable_magnesium"
  | "sulphur";

export class UnitValidationError extends Error {}

interface VariableDefinition {
  canonicalUnit: string;
  min: number;
  max: number;
  acceptedUnits: Record<string, (value: number) => number>;
}

/**
 * Un nutriente reportado como fracción de masa.
 *
 * **Una constante y no diez copias del mismo literal.** Estaban repetidas, y un
 * flip-test lo destapó: mutar la conversión de UNA de ellas no rompía ningún
 * test, porque sólo el potasio tenía aserción. Con una definición compartida
 * hay un solo sitio que romper, y romperlo se ve.
 *
 * Las cuatro unidades son la misma magnitud con conversión exacta: un
 * laboratorio reporta % y otro mg/kg para el mismo análisis, y el foliar viene
 * en g/kg (§7.2 del marco da ahí los rangos de suficiencia). Obligar a
 * convertir a mano es cómo se cuelan los errores de dos órdenes de magnitud.
 *
 * El tope no es una opinión sobre qué es plausible: 1.000.000 mg/kg es el 100 %,
 * el límite aritmético de una fracción de masa.
 */
const NUTRIENTE_POR_MASA: VariableDefinition = {
  canonicalUnit: "mg/kg",
  min: 0,
  max: 1_000_000,
  acceptedUnits: { "mg/kg": (v) => v, ppm: (v) => v, "%": (v) => v * 10_000, "g/kg": (v) => v * 1_000 },
};

const REGISTRY: Record<MeasurementVariable, VariableDefinition> = {
  temperature: {
    canonicalUnit: "C",
    min: -10,
    max: 80,
    acceptedUnits: {
      C: (v) => v,
      F: (v) => ((v - 32) * 5) / 9,
    },
  },
  ph: {
    canonicalUnit: "pH",
    min: 0,
    max: 14,
    acceptedUnits: { pH: (v) => v },
  },
  brix: {
    canonicalUnit: "Bx",
    min: 0,
    max: 40,
    acceptedUnits: { Bx: (v) => v },
  },
  relative_humidity: {
    canonicalUnit: "%",
    min: 0,
    max: 100,
    acceptedUnits: { "%": (v) => v },
  },
  moisture: {
    canonicalUnit: "%",
    min: 0,
    max: 100,
    acceptedUnits: { "%": (v) => v },
  },
  water_activity: {
    canonicalUnit: "aw",
    min: 0,
    max: 1,
    acceptedUnits: { aw: (v) => v },
  },
  water_volume_pulping: { canonicalUnit: "L", min: 0, max: 100000, acceptedUnits: { L: (v) => v } },
  water_volume_washing: { canonicalUnit: "L", min: 0, max: 100000, acceptedUnits: { L: (v) => v } },
  water_to_coffee_ratio: { canonicalUnit: "L/kg", min: 0, max: 50, acceptedUnits: { "L/kg": (v) => v } },
  wash_medium_volume: { canonicalUnit: "L", min: 0, max: 100000, acceptedUnits: { L: (v) => v } },
  wash_medium_ph: { canonicalUnit: "pH", min: 0, max: 14, acceptedUnits: { pH: (v) => v } },
  wash_medium_brix: { canonicalUnit: "Bx", min: 0, max: 40, acceptedUnits: { Bx: (v) => v } },
  wash_medium_temperature: {
    canonicalUnit: "C",
    min: -10,
    max: 80,
    acceptedUnits: { C: (v) => v, F: (v) => ((v - 32) * 5) / 9 },
  },
  cold_hold_initial_temperature: {
    canonicalUnit: "C",
    min: -10,
    max: 80,
    acceptedUnits: { C: (v) => v, F: (v) => ((v - 32) * 5) / 9 },
  },
  cold_hold_target_temperature_min: {
    canonicalUnit: "C",
    min: -10,
    max: 80,
    acceptedUnits: { C: (v) => v, F: (v) => ((v - 32) * 5) / 9 },
  },
  cold_hold_target_temperature_max: {
    canonicalUnit: "C",
    min: -10,
    max: 80,
    acceptedUnits: { C: (v) => v, F: (v) => ((v - 32) * 5) / 9 },
  },
  // "Velocidad de descenso (min/°C)" — literally minutes per degree of
  // cooling, the unit the reference card itself uses. Not inverted to
  // °C/min: keep what the product owner actually records.
  cold_hold_descent_rate: { canonicalUnit: "min/C", min: 0, max: 1000, acceptedUnits: { "min/C": (v) => v } },
  cold_hold_plateau_duration: { canonicalUnit: "h", min: 0, max: 500, acceptedUnits: { h: (v) => v } },
  // Confirmed by the product owner (post-RO1.2, §6 follow-up): g/kg, not
  // an absolute gram weight — dose scales with the cherry mass being
  // treated. The CryoBloom reference card's real figure is 1 g/kg base,
  // plus a 30% adjustment (~1.3 g/kg) — 20 g/kg comfortably covers real
  // dosing without being so wide it stops catching a fat-fingered entry.
  bioprotective_yeast_dose: { canonicalUnit: "g/kg", min: 0, max: 20, acceptedUnits: { "g/kg": (v) => v } },
  rehydration_time: { canonicalUnit: "min", min: 0, max: 1440, acceptedUnits: { min: (v) => v } },
  cold_hold_pre_seal_temperature: {
    canonicalUnit: "C",
    min: -10,
    max: 80,
    acceptedUnits: { C: (v) => v, F: (v) => ((v - 32) * 5) / 9 },
  },
  cold_hold_arrival_temperature: {
    canonicalUnit: "C",
    min: -10,
    max: 80,
    acceptedUnits: { C: (v) => v, F: (v) => ((v - 32) * 5) / 9 },
  },
  cold_hold_post_rinse_temperature: {
    canonicalUnit: "C",
    min: -10,
    max: 80,
    acceptedUnits: { C: (v) => v, F: (v) => ((v - 32) * 5) / 9 },
  },
  thermal_shock_cycle_duration: { canonicalUnit: "min", min: 0, max: 1440, acceptedUnits: { min: (v) => v } },
  thermal_shock_cutoff_temperature: {
    canonicalUnit: "C",
    min: -10,
    max: 80,
    acceptedUnits: { C: (v) => v, F: (v) => ((v - 32) * 5) / 9 },
  },
  cold_shock_start_temperature: {
    canonicalUnit: "C",
    min: -10,
    max: 80,
    acceptedUnits: { C: (v) => v, F: (v) => ((v - 32) * 5) / 9 },
  },
  cold_shock_end_temperature: {
    canonicalUnit: "C",
    min: -10,
    max: 80,
    acceptedUnits: { C: (v) => v, F: (v) => ((v - 32) * 5) / 9 },
  },
  cold_shock_descent_duration: { canonicalUnit: "min", min: 0, max: 1440, acceptedUnits: { min: (v) => v } },
  river_water_temperature: {
    canonicalUnit: "C",
    min: -10,
    max: 80,
    acceptedUnits: { C: (v) => v, F: (v) => ((v - 32) * 5) / 9 },
  },
  submersion_depth: { canonicalUnit: "m", min: 0, max: 50, acceptedUnits: { m: (v) => v } },
  vessel_pressure: { canonicalUnit: "bar", min: 0, max: 10, acceptedUnits: { bar: (v) => v } },
  brine_concentration: { canonicalUnit: "%", min: 0, max: 100, acceptedUnits: { "%": (v) => v } },
  co_ferment_quantity: { canonicalUnit: "kg", min: 0, max: 10000, acceptedUnits: { kg: (v) => v } },
  koji_propagation_duration: { canonicalUnit: "h", min: 0, max: 500, acceptedUnits: { h: (v) => v } },

  // --- S1, Tabla 7: caracterización de biochar --------------------------
  // 1 dS/m = 1 mS/cm exactamente; se aceptan las dos porque los informes usan
  // ambas y la conversión no da lugar a duda.
  electrical_conductivity: {
    canonicalUnit: "dS/m",
    min: 0,
    max: 100,
    acceptedUnits: { "dS/m": (v) => v, "mS/cm": (v) => v },
  },
  ash_content: { canonicalUnit: "%", min: 0, max: 100, acceptedUnits: { "%": (v) => v } },
  total_carbon: { canonicalUnit: "%", min: 0, max: 100, acceptedUnits: { "%": (v) => v } },
  total_nitrogen: { canonicalUnit: "%", min: 0, max: 100, acceptedUnits: { "%": (v) => v, "g/kg": (v) => v / 10 } },
  // Adimensional. El tope es alto a propósito: un biochar de madera sin cargar
  // pasa de 300 con facilidad, y ése es justo el caso que el marco advierte
  // —«un char de C:N alto sin cargar puede reducir temporalmente el nitrógeno
  // disponible»—, así que rechazarlo escondería lo que hay que ver.
  carbon_nitrogen_ratio: { canonicalUnit: "C:N", min: 0, max: 1000, acceptedUnits: { "C:N": (v) => v } },
  phosphorus: NUTRIENTE_POR_MASA,
  potassium: NUTRIENTE_POR_MASA,
  calcium: NUTRIENTE_POR_MASA,
  magnesium: NUTRIENTE_POR_MASA,
  iron: NUTRIENTE_POR_MASA,
  manganese: NUTRIENTE_POR_MASA,
  zinc: NUTRIENTE_POR_MASA,
  copper: NUTRIENTE_POR_MASA,
  boron: NUTRIENTE_POR_MASA,

  // --- S1, Tabla 3: química de suelo base ------------------------------
  // El marco pide pH en agua Y en KCl: «medir los dos revela la acidez de
  // reserva». Son dos lecturas distintas del mismo suelo, así que dos
  // variables — no una con una nota.
  ph_kcl: { canonicalUnit: "pH", min: 0, max: 14, acceptedUnits: { pH: (v) => v } },
  organic_matter: { canonicalUnit: "%", min: 0, max: 100, acceptedUnits: { "%": (v) => v } },
  // cmol/kg y meq/100 g son la MISMA unidad con dos nombres, no una conversión:
  // 1 cmol(+)/kg = 1 meq/100 g exactamente. Los laboratorios usan las dos.
  cec: { canonicalUnit: "cmol/kg", min: 0, max: 200, acceptedUnits: { "cmol/kg": (v) => v, "meq/100g": (v) => v } },
  effective_cec: { canonicalUnit: "cmol/kg", min: 0, max: 200, acceptedUnits: { "cmol/kg": (v) => v, "meq/100g": (v) => v } },
  exchangeable_acidity: { canonicalUnit: "cmol/kg", min: 0, max: 200, acceptedUnits: { "cmol/kg": (v) => v, "meq/100g": (v) => v } },
  // «El número más importante para la salud radicular en este tipo de suelo»
  // (Tabla 3).
  exchangeable_aluminium: { canonicalUnit: "cmol/kg", min: 0, max: 200, acceptedUnits: { "cmol/kg": (v) => v, "meq/100g": (v) => v } },
  exchangeable_potassium: { canonicalUnit: "cmol/kg", min: 0, max: 200, acceptedUnits: { "cmol/kg": (v) => v, "meq/100g": (v) => v } },
  exchangeable_calcium: { canonicalUnit: "cmol/kg", min: 0, max: 200, acceptedUnits: { "cmol/kg": (v) => v, "meq/100g": (v) => v } },
  exchangeable_magnesium: { canonicalUnit: "cmol/kg", min: 0, max: 200, acceptedUnits: { "cmol/kg": (v) => v, "meq/100g": (v) => v } },
  // Saturaciones: porcentajes de la CIC efectiva.
  aluminium_saturation: { canonicalUnit: "%", min: 0, max: 100, acceptedUnits: { "%": (v) => v } },
  base_saturation: { canonicalUnit: "%", min: 0, max: 100, acceptedUnits: { "%": (v) => v } },
  sulphur: { canonicalUnit: "mg/kg", min: 0, max: 1_000_000, acceptedUnits: { "mg/kg": (v) => v, ppm: (v) => v, "%": (v) => v * 10_000, "g/kg": (v) => v * 1_000 } },
};

export function isKnownVariable(variable: string): variable is MeasurementVariable {
  return Object.prototype.hasOwnProperty.call(REGISTRY, variable);
}

/**
 * Converts an operator-entered value/unit into the canonical stored form,
 * rejecting unknown variables, unsupported source units, and out-of-range
 * results (§10.3's per-variable range checks) in one place — never
 * duplicated per form (§11, avoiding input prompt §12's named risk).
 */
export function normalizeToCanonical(
  variable: MeasurementVariable,
  value: number,
  sourceUnit: string,
): { value: number; unit: string } {
  const definition = REGISTRY[variable];
  const converter = definition.acceptedUnits[sourceUnit];
  if (!converter) {
    throw new UnitValidationError(`unsupported_unit:${variable}:${sourceUnit}`);
  }
  const normalized = converter(value);
  if (normalized < definition.min || normalized > definition.max) {
    throw new UnitValidationError(`out_of_range:${variable}:${normalized}`);
  }
  return { value: normalized, unit: definition.canonicalUnit };
}

/**
 * En qué formulario se ofrece cada variable — S1 §2.
 *
 * Un registro global tiene un efecto que no se ve hasta que se le añade algo:
 * la lista la consume el formulario de recetas de café como desplegable, así
 * que meter «contenido de cenizas» sin más lo habría puesto a elegir como
 * objetivo de proceso de un café. Son la misma clase de dato —magnitud, unidad,
 * límites— en sitios de trabajo distintos.
 *
 * **Un mapa explícito, no un conjunto invertido.** La primera versión de esto
 * filtraba con `!ANALISIS.has(v) || v === "ph" || v === "moisture"`: dos
 * excepciones cosidas a mano con sólo dos dominios. Con cuatro sería ilegible,
 * y es la clase de expresión donde un error no se ve. Aquí cada variable de
 * laboratorio dice a qué paneles pertenece, y lo que no aparece es de proceso
 * de café — que era todo el registro antes de S1.
 *
 * Varias variables están en varios paneles a propósito. `ph` se mide en el
 * biochar y en el suelo; el fósforo, en los dos y además en la hoja. Es la
 * misma magnitud física, y lo que dice de qué se habla es **el sujeto de la
 * fila**, no el nombre de la variable — el precedente que este archivo ya cita
 * para `roastSessionId`.
 */
const PANELES: Record<MeasurementVariable, readonly DominioDeVariable[]> = {
  // --- Proceso de café: todo el registro anterior a S1. Se listan una por
  // una y no por defecto, para que el compilador obligue a decidir el panel
  // de cada variable NUEVA en vez de adoptarla en silencio.
  temperature: ["proceso_de_cafe"],
  brix: ["proceso_de_cafe"],
  relative_humidity: ["proceso_de_cafe"],
  water_activity: ["proceso_de_cafe"],
  water_volume_pulping: ["proceso_de_cafe"],
  water_volume_washing: ["proceso_de_cafe"],
  water_to_coffee_ratio: ["proceso_de_cafe"],
  wash_medium_volume: ["proceso_de_cafe"],
  wash_medium_ph: ["proceso_de_cafe"],
  wash_medium_brix: ["proceso_de_cafe"],
  wash_medium_temperature: ["proceso_de_cafe"],
  cold_hold_initial_temperature: ["proceso_de_cafe"],
  cold_hold_target_temperature_min: ["proceso_de_cafe"],
  cold_hold_target_temperature_max: ["proceso_de_cafe"],
  cold_hold_descent_rate: ["proceso_de_cafe"],
  cold_hold_plateau_duration: ["proceso_de_cafe"],
  bioprotective_yeast_dose: ["proceso_de_cafe"],
  rehydration_time: ["proceso_de_cafe"],
  cold_hold_pre_seal_temperature: ["proceso_de_cafe"],
  cold_hold_arrival_temperature: ["proceso_de_cafe"],
  cold_hold_post_rinse_temperature: ["proceso_de_cafe"],
  thermal_shock_cycle_duration: ["proceso_de_cafe"],
  thermal_shock_cutoff_temperature: ["proceso_de_cafe"],
  cold_shock_start_temperature: ["proceso_de_cafe"],
  cold_shock_end_temperature: ["proceso_de_cafe"],
  cold_shock_descent_duration: ["proceso_de_cafe"],
  river_water_temperature: ["proceso_de_cafe"],
  submersion_depth: ["proceso_de_cafe"],
  vessel_pressure: ["proceso_de_cafe"],
  brine_concentration: ["proceso_de_cafe"],
  co_ferment_quantity: ["proceso_de_cafe"],
  koji_propagation_duration: ["proceso_de_cafe"],

  ph: ["proceso_de_cafe", "analisis_de_enmienda", "analisis_de_suelo"],
  moisture: ["proceso_de_cafe", "analisis_de_enmienda"],
  electrical_conductivity: ["analisis_de_enmienda", "analisis_de_suelo"],
  ash_content: ["analisis_de_enmienda"],
  total_carbon: ["analisis_de_enmienda", "analisis_de_suelo"],
  total_nitrogen: ["analisis_de_enmienda", "analisis_de_suelo", "analisis_foliar"],
  carbon_nitrogen_ratio: ["analisis_de_enmienda", "analisis_de_suelo"],
  phosphorus: ["analisis_de_enmienda", "analisis_de_suelo", "analisis_foliar"],
  potassium: ["analisis_de_enmienda", "analisis_foliar"],
  calcium: ["analisis_de_enmienda", "analisis_foliar"],
  magnesium: ["analisis_de_enmienda", "analisis_foliar"],
  iron: ["analisis_de_enmienda", "analisis_de_suelo", "analisis_foliar"],
  manganese: ["analisis_de_enmienda", "analisis_de_suelo", "analisis_foliar"],
  zinc: ["analisis_de_enmienda", "analisis_de_suelo", "analisis_foliar"],
  copper: ["analisis_de_enmienda", "analisis_de_suelo", "analisis_foliar"],
  boron: ["analisis_de_enmienda", "analisis_de_suelo", "analisis_foliar"],
  // Tabla 3 — sólo suelo. Los cationes intercambiables van en cmol/kg, que no
  // es la unidad en que se reporta la hoja, así que no se ofrecen en foliar
  // aunque el elemento sea el mismo.
  ph_kcl: ["analisis_de_suelo"],
  organic_matter: ["analisis_de_suelo"],
  cec: ["analisis_de_suelo"],
  effective_cec: ["analisis_de_suelo"],
  exchangeable_acidity: ["analisis_de_suelo"],
  exchangeable_aluminium: ["analisis_de_suelo"],
  aluminium_saturation: ["analisis_de_suelo"],
  base_saturation: ["analisis_de_suelo"],
  exchangeable_potassium: ["analisis_de_suelo"],
  exchangeable_calcium: ["analisis_de_suelo"],
  exchangeable_magnesium: ["analisis_de_suelo"],
  // §7.1 pide azufre en la hoja; la Tabla 3 lo pide en el suelo.
  sulphur: ["analisis_de_suelo", "analisis_foliar"],
};

export type DominioDeVariable =
  | "proceso_de_cafe"
  | "analisis_de_enmienda"
  | "analisis_de_suelo"
  | "analisis_foliar";

/**
 * Los cuatro paneles, para que un guardia pueda recorrerlos todos sin
 * enumerarlos a mano y quedarse corto cuando aparezca el quinto.
 */
export const DOMINIOS_DE_VARIABLE = [
  "proceso_de_cafe",
  "analisis_de_enmienda",
  "analisis_de_suelo",
  "analisis_foliar",
] as const;

/**
 * ¿Pertenece esta variable a este panel de laboratorio?
 *
 * Existe porque la revisión independiente del 2026-09-01 encontró que `PANELES`
 * sólo filtraba **listas de formulario**: `recordMeasurement` aceptaba cualquier
 * variable para cualquier sujeto, así que la separación de dominios era
 * conveniencia de pantalla y no regla de integridad. Gate 0 dependía de eso —
 * una lectura de Brix colgada de una muestra de suelo abría «química base».
 *
 * Acepta un `string` y no un `MeasurementVariable` a propósito: quien pregunta
 * suele tener el `variable` de una fila de `Measurement`, que es texto libre en
 * el esquema. Una variable desconocida no pertenece a ningún panel.
 */
export function variablePerteneceAlPanel(variable: string, dominio: DominioDeVariable): boolean {
  if (!isKnownVariable(variable)) return false;
  return panelesDe(variable).includes(dominio);
}

/**
 * El registro entero, sin filtrar por panel.
 *
 * Existe para el guardia de cobertura: comparar la unión de los paneles contra
 * ESTO es lo único que detecta una variable que se quedó fuera de todos. La
 * versión anterior de ese test comparaba la unión de dos paneles contra la
 * unión de esos mismos dos paneles — no podía fallar.
 */
export function listAllVariableNames(): MeasurementVariable[] {
  return Object.keys(REGISTRY) as MeasurementVariable[];
}

/**
 * A qué paneles pertenece una variable.
 *
 * **Sin valor por defecto, y es deliberado.** La primera versión hacía
 * `PANELES[v] ?? ["proceso_de_cafe"]`, y ese `??` volvía infalsificable el
 * guardia de cobertura: ninguna variable podía quedar huérfana porque el
 * default la adoptaba. Peor: una variable de laboratorio nueva sin entrada
 * caía en silencio en el desplegable de recetas de café, que es exactamente el
 * fallo que esta separación existe para impedir.
 *
 * `PANELES` es ahora un `Record` total, así que **el compilador** obliga a
 * declarar el panel de cada variable nueva. Es un guardia más fuerte que un
 * test: no se puede fusionar sin decidirlo.
 */
function panelesDe(v: MeasurementVariable): readonly DominioDeVariable[] {
  return PANELES[v];
}

/**
 * Every canonical variable with its unit and physical bounds — ADR-100.
 *
 * Added so the recipe form can offer a picker instead of a free-text field,
 * and so a target can be checked against the same bounds a reading is. A
 * declared target of pH 15 is not a preference the platform should record; it
 * is a typo, and the registry already knew that.
 *
 * S1 §2: el dominio es **obligatorio**, no opcional con un valor por defecto.
 * Un parámetro que se puede omitir se omite, y el primer formulario nuevo
 * habría vuelto a mezclar las listas sin que nadie lo notara.
 */
export function listVariableDefinitions(dominio: DominioDeVariable): {
  variable: MeasurementVariable;
  canonicalUnit: string;
  min: number;
  max: number;
}[] {
  return (Object.keys(REGISTRY) as MeasurementVariable[])
    .filter((v) => panelesDe(v).includes(dominio))
    .map((variable) => ({
      variable,
      canonicalUnit: REGISTRY[variable].canonicalUnit,
      min: REGISTRY[variable].min,
      max: REGISTRY[variable].max,
    }));
}

/** The bounds for one variable, or null when the name is not canonical. */
export function boundsFor(variable: string): { canonicalUnit: string; min: number; max: number } | null {
  if (!isKnownVariable(variable)) return null;
  const d = REGISTRY[variable];
  return { canonicalUnit: d.canonicalUnit, min: d.min, max: d.max };
}

/**
 * Las unidades que una variable admite, en orden, con la canónica primero.
 *
 * **Por qué existe (2026-09-11).** El formulario de medición pedía la unidad en
 * una **caja de texto libre**, obligatoria, con la pista «C, pH, Bx, %, aw». De
 * las seis variables que ofrece, **cinco admiten una sola unidad**: escribirla
 * era teclear a mano una respuesta que el registro ya conoce, y equivocarse al
 * teclearla era un rechazo. Daniel, probándolo: «its like you are trying to make
 * me work more».
 *
 * Con esto la pantalla puede decidir: una sola → no se pregunta; varias → un
 * desplegable con esas y sólo esas. El registro sigue siendo la única fuente,
 * así que añadir una unidad a una variable cambia la pantalla sin tocarla.
 *
 * Devuelve `[]` si la variable no existe — y no lanza, porque quien pinta un
 * formulario no debe reventar por un nombre desconocido; `normalizeToCanonical`
 * ya rechaza en el envío, que es donde importa.
 */
export function unidadesAceptadas(variable: string): string[] {
  if (!isKnownVariable(variable)) return [];
  const def = REGISTRY[variable];
  const canonica = def.canonicalUnit;
  const resto = Object.keys(def.acceptedUnits).filter((u) => u !== canonica);
  // La canónica primero: es la que el sistema guarda, y encabezar con ella hace
  // que el valor por defecto de un desplegable sea el que no convierte nada.
  return [canonica, ...resto];
}
