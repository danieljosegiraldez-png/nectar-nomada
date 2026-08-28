/**
 * Which action a batch is waiting for — ADR-096.
 *
 * The batch detail page offered five buttons of identical weight: start
 * fermentation, start drying, move to storage, create sample, view report.
 * All the same size, all the same colour, in one flex row. Nothing on the page
 * said which one a batch at this stage was actually waiting for, so the
 * operator had to know the answer before arriving — which they usually do, but
 * it makes the page a list of capabilities rather than a place work happens
 * (ADR-080 deferred this deliberately, as a design question rather than a
 * defect).
 *
 * The sequence encoded here is the product owner's, confirmed rather than
 * inferred: cherry is waiting to ferment, processing to dry, drying to be
 * stored. Green and roasted coffee is waiting to be tasted.
 *
 * **This suggests, it never restricts.** Every action the page offered before
 * is still offered and still reachable in one click. The only change is that
 * one of them is drawn as the expected next step. A batch that skips a stage —
 * and they do — costs the operator nothing extra.
 *
 * Pure function of a lot's type and whether a run is under way: no I/O, no
 * Prisma, trivially testable, same shape as lib/navigation.ts.
 */
import type { LotType } from "../../generated/prisma/client";

export type BatchAction = "measurement" | "fermentation" | "drying" | "storage" | "sample" | "report";

/**
 * The action a batch of this type is expected to need next, or `null` when
 * there is no meaningful answer.
 *
 * `null` is a real result, not a gap to be filled later. A `sample` is an end
 * state — it goes to sensory, not to another processing stage. `honey` reaches
 * a Lot through A3's "a honey batch is a Lot" decision and does not travel the
 * coffee sequence at all. `other` exists precisely because the material did not
 * fit a stage, so guessing one for it would be inventing a fact.
 */
export function nextActionFor(lotType: LotType, hasActiveRun: boolean): BatchAction | null {
  // A batch already fermenting or drying is not waiting for a new stage — but
  // it is not waiting for nothing either, which is what this returned at first.
  // The product owner opened PE-96-A mid-fermentation and said plainly what the
  // page should have said: it needs a measurement.
  //
  // That is what a run *is*. You do not start a fermentation and walk away; you
  // take a reading, and another, and you end the run when the numbers say to.
  // Suggesting a new stage here would point away from the work in progress;
  // suggesting nothing pretended there was none.
  if (hasActiveRun) return "measurement";

  switch (lotType) {
    case "cherry":
      return "fermentation";
    case "processing":
      return "drying";
    case "drying":
      return "storage";
    // Green and roasted coffee is waiting to be tasted. Both land on the same
    // action for the same reason, and are listed separately rather than
    // collapsed so that changing one later does not silently change the other.
    case "green":
      return "sample";
    case "roast":
      return "sample";
    case "sample":
    case "honey":
    case "other":
      return null;
  }
}
