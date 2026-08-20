/**
 * S2 §8 verification points 1–3, plus the rules they imply.
 *
 * Deliberately pure: comparability is decided by
 * `lib/sensory/purpose.ts` without I/O, so these run against no database and
 * leave no audit rows behind. That matters here — the rest of this suite runs
 * against real Neon (see vitest.config.ts), and a rule about what may be
 * compared should not need a database to assert.
 */

import { describe, it, expect } from "vitest";
import {
  comparePurposes,
  areSessionsComparable,
  assertSessionsComparable,
  SensoryComparabilityError,
  type SessionComparabilityFacts,
} from "../../lib/sensory/purpose";

const PROTOCOL = "protocol-version-1";

function session(over: Partial<SessionComparabilityFacts> = {}): SessionComparabilityFacts {
  return {
    label: "session",
    purpose: "rank",
    subject: "prepared_beverage",
    protocolVersionId: PROTOCOL,
    ...over,
  };
}

describe("comparePurposes", () => {
  it("§8.1 — ranking and conformance verification are not the same measurement", () => {
    const verdict = comparePurposes("rank", "verify_conformance");
    expect(verdict.comparable).toBe(false);
    expect(verdict).toMatchObject({ reason: "purpose_not_comparable:rank_vs_verify_conformance" });
  });

  it("§8.2 — hedonic never combines with any technical purpose", () => {
    for (const technical of ["rank", "verify_conformance", "characterize", "select"] as const) {
      expect(comparePurposes("hedonic", technical).comparable).toBe(false);
      expect(comparePurposes(technical, "hedonic").comparable).toBe(false);
    }
  });

  it("hedonic still compares with hedonic — the rule separates it, it does not isolate it", () => {
    expect(comparePurposes("hedonic", "hedonic").comparable).toBe(true);
  });

  it("rank and characterize are mutually comparable — same scales, different use of the reading", () => {
    expect(comparePurposes("rank", "characterize").comparable).toBe(true);
    expect(comparePurposes("characterize", "rank").comparable).toBe(true);
  });

  it("verify_conformance and select compare only with themselves", () => {
    expect(comparePurposes("verify_conformance", "verify_conformance").comparable).toBe(true);
    expect(comparePurposes("select", "select").comparable).toBe(true);
    expect(comparePurposes("verify_conformance", "select").comparable).toBe(false);
    expect(comparePurposes("select", "characterize").comparable).toBe(false);
  });

  it("an undeclared purpose is refused, and two undeclared purposes are not 'the same'", () => {
    // §6 — inferring what a past session was for is exactly the interpretation
    // provenance forbids, so null is a refusal rather than a wildcard.
    expect(comparePurposes(null, "rank")).toMatchObject({ comparable: false, reason: "purpose_not_declared" });
    expect(comparePurposes(null, null)).toMatchObject({ comparable: false, reason: "purpose_not_declared" });
  });
});

describe("areSessionsComparable", () => {
  it("§8.3 — the same beverage brewed differently stays comparable", () => {
    // The point of modelling extraction as an attribute rather than a subject
    // (§2b): a barista comparing espresso against filter of the same coffee is
    // doing something meaningful, and the model must not forbid it.
    const espresso = session({ label: "espresso", preparationMethod: "espresso" });
    const filter = session({ label: "filter", preparationMethod: "filter" });
    expect(areSessionsComparable(espresso, filter).comparable).toBe(true);
  });

  it("refuses across different subjects", () => {
    const cherry = session({ label: "cherry", subject: "raw_material_in_process" });
    const cup = session({ label: "cup", subject: "prepared_beverage" });
    expect(areSessionsComparable(cherry, cup)).toMatchObject({
      comparable: false,
      reason: "subject_mismatch:raw_material_in_process_vs_prepared_beverage",
    });
  });

  it("refuses an undeclared subject", () => {
    expect(areSessionsComparable(session(), session({ subject: null }))).toMatchObject({
      comparable: false,
      reason: "subject_not_declared",
    });
  });

  it("refuses across protocol versions, including within one purpose", () => {
    const other = session({ label: "other", protocolVersionId: "protocol-version-2" });
    expect(areSessionsComparable(session(), other)).toMatchObject({
      comparable: false,
      reason: "protocol_version_mismatch",
    });
  });
});

describe("assertSessionsComparable", () => {
  it("accepts a set that agrees, and a set too small to disagree", () => {
    expect(() => assertSessionsComparable([])).not.toThrow();
    expect(() => assertSessionsComparable([session()])).not.toThrow();
    expect(() => assertSessionsComparable([session(), session({ purpose: "characterize" })])).not.toThrow();
  });

  it("throws naming both sides, so the error says which session broke the set", () => {
    const rank = session({ label: "Cata de competencia" });
    const qc = session({ label: "QC lote 42", purpose: "verify_conformance" });
    try {
      assertSessionsComparable([rank, qc]);
      throw new Error("expected assertSessionsComparable to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SensoryComparabilityError);
      const err = error as SensoryComparabilityError;
      expect(err.left).toBe("Cata de competencia");
      expect(err.right).toBe("QC lote 42");
      expect(err.message).toContain("rank_vs_verify_conformance");
    }
  });
});
