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
  | "boron";

export class UnitValidationError extends Error {}

interface VariableDefinition {
  canonicalUnit: string;
  min: number;
  max: number;
  acceptedUnits: Record<string, (value: number) => number>;
}

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
  total_nitrogen: { canonicalUnit: "%", min: 0, max: 100, acceptedUnits: { "%": (v) => v } },
  // Adimensional. El tope es alto a propósito: un biochar de madera sin cargar
  // pasa de 300 con facilidad, y ése es justo el caso que el marco advierte
  // —«un char de C:N alto sin cargar puede reducir temporalmente el nitrógeno
  // disponible»—, así que rechazarlo escondería lo que hay que ver.
  carbon_nitrogen_ratio: { canonicalUnit: "C:N", min: 0, max: 1000, acceptedUnits: { "C:N": (v) => v } },
  phosphorus: {
    canonicalUnit: "mg/kg",
    min: 0,
    // 1.000.000 mg/kg es el 100 %: el tope no es una opinión sobre qué es
    // plausible, es el límite aritmético de una fracción de masa.
    max: 1_000_000,
    // Las tres unidades son la misma magnitud con conversión exacta, así que
    // aceptarlas no es inventar nada: un laboratorio reporta % y otro mg/kg
    // para el mismo análisis, y obligar a convertir a mano es cómo se cuelan
    // los errores de dos órdenes de magnitud.
    acceptedUnits: { "mg/kg": (v) => v, ppm: (v) => v, "%": (v) => v * 10_000 },
  },
  potassium: {
    canonicalUnit: "mg/kg",
    min: 0,
    // 1.000.000 mg/kg es el 100 %: el tope no es una opinión sobre qué es
    // plausible, es el límite aritmético de una fracción de masa.
    max: 1_000_000,
    // Las tres unidades son la misma magnitud con conversión exacta, así que
    // aceptarlas no es inventar nada: un laboratorio reporta % y otro mg/kg
    // para el mismo análisis, y obligar a convertir a mano es cómo se cuelan
    // los errores de dos órdenes de magnitud.
    acceptedUnits: { "mg/kg": (v) => v, ppm: (v) => v, "%": (v) => v * 10_000 },
  },
  calcium: {
    canonicalUnit: "mg/kg",
    min: 0,
    // 1.000.000 mg/kg es el 100 %: el tope no es una opinión sobre qué es
    // plausible, es el límite aritmético de una fracción de masa.
    max: 1_000_000,
    // Las tres unidades son la misma magnitud con conversión exacta, así que
    // aceptarlas no es inventar nada: un laboratorio reporta % y otro mg/kg
    // para el mismo análisis, y obligar a convertir a mano es cómo se cuelan
    // los errores de dos órdenes de magnitud.
    acceptedUnits: { "mg/kg": (v) => v, ppm: (v) => v, "%": (v) => v * 10_000 },
  },
  magnesium: {
    canonicalUnit: "mg/kg",
    min: 0,
    // 1.000.000 mg/kg es el 100 %: el tope no es una opinión sobre qué es
    // plausible, es el límite aritmético de una fracción de masa.
    max: 1_000_000,
    // Las tres unidades son la misma magnitud con conversión exacta, así que
    // aceptarlas no es inventar nada: un laboratorio reporta % y otro mg/kg
    // para el mismo análisis, y obligar a convertir a mano es cómo se cuelan
    // los errores de dos órdenes de magnitud.
    acceptedUnits: { "mg/kg": (v) => v, ppm: (v) => v, "%": (v) => v * 10_000 },
  },
  iron: {
    canonicalUnit: "mg/kg",
    min: 0,
    // 1.000.000 mg/kg es el 100 %: el tope no es una opinión sobre qué es
    // plausible, es el límite aritmético de una fracción de masa.
    max: 1_000_000,
    // Las tres unidades son la misma magnitud con conversión exacta, así que
    // aceptarlas no es inventar nada: un laboratorio reporta % y otro mg/kg
    // para el mismo análisis, y obligar a convertir a mano es cómo se cuelan
    // los errores de dos órdenes de magnitud.
    acceptedUnits: { "mg/kg": (v) => v, ppm: (v) => v, "%": (v) => v * 10_000 },
  },
  manganese: {
    canonicalUnit: "mg/kg",
    min: 0,
    // 1.000.000 mg/kg es el 100 %: el tope no es una opinión sobre qué es
    // plausible, es el límite aritmético de una fracción de masa.
    max: 1_000_000,
    // Las tres unidades son la misma magnitud con conversión exacta, así que
    // aceptarlas no es inventar nada: un laboratorio reporta % y otro mg/kg
    // para el mismo análisis, y obligar a convertir a mano es cómo se cuelan
    // los errores de dos órdenes de magnitud.
    acceptedUnits: { "mg/kg": (v) => v, ppm: (v) => v, "%": (v) => v * 10_000 },
  },
  zinc: {
    canonicalUnit: "mg/kg",
    min: 0,
    // 1.000.000 mg/kg es el 100 %: el tope no es una opinión sobre qué es
    // plausible, es el límite aritmético de una fracción de masa.
    max: 1_000_000,
    // Las tres unidades son la misma magnitud con conversión exacta, así que
    // aceptarlas no es inventar nada: un laboratorio reporta % y otro mg/kg
    // para el mismo análisis, y obligar a convertir a mano es cómo se cuelan
    // los errores de dos órdenes de magnitud.
    acceptedUnits: { "mg/kg": (v) => v, ppm: (v) => v, "%": (v) => v * 10_000 },
  },
  copper: {
    canonicalUnit: "mg/kg",
    min: 0,
    // 1.000.000 mg/kg es el 100 %: el tope no es una opinión sobre qué es
    // plausible, es el límite aritmético de una fracción de masa.
    max: 1_000_000,
    // Las tres unidades son la misma magnitud con conversión exacta, así que
    // aceptarlas no es inventar nada: un laboratorio reporta % y otro mg/kg
    // para el mismo análisis, y obligar a convertir a mano es cómo se cuelan
    // los errores de dos órdenes de magnitud.
    acceptedUnits: { "mg/kg": (v) => v, ppm: (v) => v, "%": (v) => v * 10_000 },
  },
  boron: {
    canonicalUnit: "mg/kg",
    min: 0,
    // 1.000.000 mg/kg es el 100 %: el tope no es una opinión sobre qué es
    // plausible, es el límite aritmético de una fracción de masa.
    max: 1_000_000,
    // Las tres unidades son la misma magnitud con conversión exacta, así que
    // aceptarlas no es inventar nada: un laboratorio reporta % y otro mg/kg
    // para el mismo análisis, y obligar a convertir a mano es cómo se cuelan
    // los errores de dos órdenes de magnitud.
    acceptedUnits: { "mg/kg": (v) => v, ppm: (v) => v, "%": (v) => v * 10_000 },
  },
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
 * Qué análisis de laboratorio mide cada variable — S1 §2, Tabla 7.
 *
 * Un registro global tiene un efecto que no se ve hasta que se añade algo: la
 * lista la ofrece el formulario de recetas de café como desplegable, así que
 * meter «contenido de cenizas» sin más lo habría puesto a elegir como
 * objetivo de proceso de un café. Son la misma clase de dato —magnitud,
 * unidad, límites— y sitios de trabajo distintos.
 *
 * `ph` y `moisture` están en los DOS conjuntos a propósito: son la misma
 * magnitud física, y lo que dice de qué se habla es el sujeto de la fila.
 */
const ANALISIS_DE_ENMIENDA = new Set<MeasurementVariable>([
  "ph",
  "moisture",
  "electrical_conductivity",
  "ash_content",
  "total_carbon",
  "total_nitrogen",
  "carbon_nitrogen_ratio",
  "phosphorus",
  "potassium",
  "calcium",
  "magnesium",
  "iron",
  "manganese",
  "zinc",
  "copper",
  "boron",
]);

export type DominioDeVariable = "proceso_de_cafe" | "analisis_de_enmienda";

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
 * habría vuelto a mezclar las dos listas sin que nadie lo notara.
 */
export function listVariableDefinitions(dominio: DominioDeVariable): {
  variable: MeasurementVariable;
  canonicalUnit: string;
  min: number;
  max: number;
}[] {
  return (Object.keys(REGISTRY) as MeasurementVariable[])
    .filter((v) => (dominio === "analisis_de_enmienda" ? ANALISIS_DE_ENMIENDA.has(v) : !ANALISIS_DE_ENMIENDA.has(v) || v === "ph" || v === "moisture"))
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
