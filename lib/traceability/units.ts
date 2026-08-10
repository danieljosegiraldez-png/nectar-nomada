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
 */
export type MeasurementVariable = "temperature" | "ph" | "brix" | "relative_humidity" | "moisture" | "water_activity";

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
