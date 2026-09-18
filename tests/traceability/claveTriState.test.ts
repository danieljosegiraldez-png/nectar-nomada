/**
 * Hermética: pura, sin base y sin reloj. No va al grupo `base-sembrada`; la
 * corre el carril hermético de `scripts/ci.sh`.
 */
import { describe, expect, it } from "vitest";
import { claveTriState } from "../../lib/traceability/claveTriState";

describe("claveTriState", () => {
  it("true da la clave de sí", () => {
    expect(claveTriState(true)).toBe("triStateYes");
  });

  it("false da la clave de no", () => {
    expect(claveTriState(false)).toBe("triStateNo");
  });

  it("null da la clave de sin registrar, nunca la de «no» (ADR-080)", () => {
    expect(claveTriState(null)).toBe("notRecorded");
  });
});
