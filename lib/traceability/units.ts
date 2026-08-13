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
  | "koji_propagation_duration";

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
