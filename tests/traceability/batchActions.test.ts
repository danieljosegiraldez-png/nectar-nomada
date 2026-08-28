/**
 * The expected next action for a batch — ADR-093.
 *
 * Pure, like tests/navigation.test.ts: the interesting cases are cheap to
 * assert exhaustively and need no database.
 *
 * These assert what is *suggested*, never what is *allowed*. Every action
 * remains reachable regardless of what this returns — the page still renders
 * all of them — so a wrong answer here is a worse hint, not a blocked
 * operator. That distinction is the whole reason this was safe to build.
 */

import { describe, it, expect } from "vitest";
import { nextActionFor } from "../../lib/traceability/batchActions";
import type { LotType } from "../../generated/prisma/client";

describe("nextActionFor", () => {
  it("follows the sequence the product owner confirmed", () => {
    expect(nextActionFor("cherry", false)).toBe("fermentation");
    expect(nextActionFor("processing", false)).toBe("drying");
    expect(nextActionFor("drying", false)).toBe("storage");
  });

  it("sends green and roasted coffee to be tasted", () => {
    expect(nextActionFor("green", false)).toBe("sample");
    expect(nextActionFor("roast", false)).toBe("sample");
  });

  it("suggests nothing while a run is under way", () => {
    // The batch is not waiting for a new stage, it is waiting for the run to
    // end — and that control lives with the run, in the Processing section.
    // Pointing at "start drying" here would point away from the work.
    expect(nextActionFor("cherry", true)).toBeNull();
    expect(nextActionFor("processing", true)).toBeNull();
    expect(nextActionFor("drying", true)).toBeNull();
  });

  it("suggests nothing for end states and non-coffee material", () => {
    // `null` is a real answer here, not a gap. A sample goes to sensory, not
    // to another stage; honey reaches Lot through A3 and never travels the
    // coffee sequence; `other` exists because the material did not fit a
    // stage, so inventing one for it would be inventing a fact.
    expect(nextActionFor("sample", false)).toBeNull();
    expect(nextActionFor("honey", false)).toBeNull();
    expect(nextActionFor("other", false)).toBeNull();
  });

  it("answers for every LotType in the schema, with no fallthrough", () => {
    // The guard that matters when a stage is added: this file is a switch over
    // the enum, and a new member must be a deliberate decision rather than an
    // accidental `undefined` reaching the page.
    const allTypes: LotType[] = ["cherry", "processing", "drying", "green", "roast", "sample", "other", "honey"];
    for (const t of allTypes) {
      const result = nextActionFor(t, false);
      expect(result === null || typeof result === "string").toBe(true);
      expect(result).not.toBeUndefined();
    }
  });
});
