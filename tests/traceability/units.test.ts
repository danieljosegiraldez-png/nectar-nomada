/**
 * Phase 1, ticket T3 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §34). Pure function, no DB — the canonical unit registry itself.
 */
import { describe, expect, it } from "vitest";
import { normalizeToCanonical, UnitValidationError } from "../../lib/traceability/units";

describe("normalizeToCanonical", () => {
  it("passes a value through unchanged when the entry unit is already canonical", () => {
    const result = normalizeToCanonical("temperature", 25, "C");
    expect(result).toEqual({ value: 25, unit: "C" });
  });

  it("converts Fahrenheit to Celsius for temperature", () => {
    const result = normalizeToCanonical("temperature", 98.6, "F");
    expect(result.unit).toBe("C");
    expect(result.value).toBeCloseTo(37, 5);
  });

  it("validates each of the 7 measurement-matrix variables against their canonical unit", () => {
    expect(normalizeToCanonical("ph", 4.5, "pH")).toEqual({ value: 4.5, unit: "pH" });
    expect(normalizeToCanonical("brix", 20, "Bx")).toEqual({ value: 20, unit: "Bx" });
    expect(normalizeToCanonical("relative_humidity", 65, "%")).toEqual({ value: 65, unit: "%" });
    expect(normalizeToCanonical("moisture", 11, "%")).toEqual({ value: 11, unit: "%" });
    expect(normalizeToCanonical("water_activity", 0.6, "aw")).toEqual({ value: 0.6, unit: "aw" });
  });

  it("rejects an unsupported source unit", () => {
    expect(() => normalizeToCanonical("ph", 4.5, "F")).toThrow(UnitValidationError);
  });

  it("rejects an out-of-range value after conversion", () => {
    expect(() => normalizeToCanonical("temperature", 200, "C")).toThrow(UnitValidationError);
    expect(() => normalizeToCanonical("ph", 15, "pH")).toThrow(UnitValidationError);
    expect(() => normalizeToCanonical("water_activity", 1.5, "aw")).toThrow(UnitValidationError);
  });
});
