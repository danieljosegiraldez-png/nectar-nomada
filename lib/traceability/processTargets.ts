/**
 * Target versus actual — ADR-098.
 *
 * The product owner's own framing, from BeerSmith: a recipe declares what a
 * run is aiming for, the run records what happened, and the value is in the
 * difference. "We target 3.8, we get 3.785."
 *
 * Until now the platform stored only actuals. 25 pH readings, 11 temperature,
 * 2 moisture — every one of them a number with nothing to compare it to. A
 * measurement on its own says what happened; it cannot say whether that was
 * what you wanted.
 *
 * Two rules this file exists to keep:
 *
 * **A target is not a measurement.** It is a declared intention, and CLAUDE.md
 * §3 requires the system to distinguish those. `cold_hold_target_temperature_
 * min` in units.ts does the opposite — it stores an intention as if it were an
 * observed fact. That predates this and is left alone here, but it is the
 * pattern this file deliberately does not follow.
 *
 * **The mean is derived, and never replaces its inputs.** CLAUDE.md §49
 * forbids combining raw measurement with calculated value; §28 requires a
 * derived metric to carry its method. So a comparison always returns the
 * individual readings alongside the mean, and the mean is computed on read
 * rather than stored. Three readings of 3.7/3.8/3.9 and three of 3.78/3.79/
 * 3.79 have the same mean and mean different things; keeping the readings is
 * what preserves that.
 */
import { prisma } from "../db";
import { Prisma } from "../../generated/prisma/client";
import { requireLotAccess } from "./lots";
import type { ProcessTargetMoment } from "../../generated/prisma/client";

export class ProcessTargetError extends Error {}

export interface Reading {
  id: string;
  value: Prisma.Decimal;
  occurredAt: Date;
}

export interface TargetComparison {
  variable: string;
  moment: ProcessTargetMoment;
  unit: string;
  note: string | null;

  /** What the recipe asked for. Any of these may be null — see ProcessTarget. */
  target: { value: Prisma.Decimal | null; min: Prisma.Decimal | null; max: Prisma.Decimal | null };

  /**
   * What happened. `readings` is the raw record and is never omitted; `mean`
   * is derived from exactly those readings and nothing else.
   */
  actual: {
    readings: Reading[];
    mean: Prisma.Decimal | null;
    /** Named so a reader never has to guess how `mean` was arrived at (§28). */
    method: "mean_of_readings" | null;
  };

  /**
   * `mean − target`, or null when either side is unknown. Null is a real
   * answer: a target with no readings yet, or a reading with no target
   * declared, has no deviation — and reporting 0 would assert agreement that
   * nobody established.
   */
  deviation: Prisma.Decimal | null;

  /**
   * Whether the actual falls inside the declared range. Null when no range was
   * declared, which is not the same as "outside".
   */
  withinRange: boolean | null;

  /**
   * True when `initial` and `final` resolved to the same single reading —
   * one measurement cannot be both the original and the final value, and
   * saying so is better than quietly reporting a deviation of zero.
   */
  ambiguousSingleReading: boolean;
}

function mean(readings: Reading[]): Prisma.Decimal | null {
  if (readings.length === 0) return null;
  const total = readings.reduce((sum, r) => sum.add(r.value), new Prisma.Decimal(0));
  return total.dividedBy(readings.length);
}

/**
 * Which readings answer a target at a given moment.
 *
 * The rule is positional and stated rather than inferred: the earliest reading
 * of a variable is its initial value, the latest is its final, and `during`
 * takes them all. That is an operational definition, not a guess about intent
 * — but it does have one honest failure, which is why `ambiguousSingleReading`
 * exists: with a single reading, earliest and latest are the same row, and it
 * cannot truthfully be both an original and a final gravity.
 */
function readingsForMoment(all: Reading[], moment: ProcessTargetMoment): { readings: Reading[]; ambiguous: boolean } {
  if (all.length === 0) return { readings: [], ambiguous: false };
  const ordered = [...all].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  if (moment === "during") return { readings: ordered, ambiguous: false };

  const single = ordered.length === 1;
  if (moment === "initial") return { readings: [ordered[0]!], ambiguous: single };
  return { readings: [ordered[ordered.length - 1]!], ambiguous: single };
}

/**
 * Every target of the run's recipe version, set against what was measured.
 *
 * Returns an empty array when the run has no recipe — a run improvised without
 * one is a legitimate state (most existing runs are), and an empty comparison
 * is the honest rendering of "nothing was declared", not an error.
 */
export async function compareRunToTargets(
  userAccountId: string,
  fermentationRunId: string,
): Promise<TargetComparison[]> {
  const run = await prisma.fermentationRun.findUnique({
    where: { id: fermentationRunId },
    include: {
      processRecipeVersion: { include: { targets: { orderBy: { displayOrder: "asc" } } } },
      measurements: { select: { id: true, variable: true, value: true, occurredAt: true } },
      transformations: { include: { inputs: { include: { lot: true } } }, take: 1 },
    },
  });
  // A run that cannot be loaded is refused rather than treated as empty — the
  // same rule the classification gate states for a stale id (ADR-081).
  if (!run) throw new ProcessTargetError("run_not_found");

  // The run itself carries no classification; the lot it belongs to does, and
  // that is what decides who may read this (ADR-068).
  const lot = run.transformations[0]?.inputs[0]?.lot;
  if (!lot) throw new ProcessTargetError("run_has_no_lot");
  await requireLotAccess(userAccountId, "view", [lot]);

  if (!run.processRecipeVersion) return [];

  const byVariable = new Map<string, Reading[]>();
  for (const m of run.measurements) {
    const list = byVariable.get(m.variable) ?? [];
    list.push({ id: m.id, value: m.value, occurredAt: m.occurredAt });
    byVariable.set(m.variable, list);
  }

  return run.processRecipeVersion.targets.map((t) => {
    const { readings, ambiguous } = readingsForMoment(byVariable.get(t.variable) ?? [], t.moment);
    const actualMean = mean(readings);

    const deviation = actualMean !== null && t.targetValue !== null ? actualMean.sub(t.targetValue) : null;

    let withinRange: boolean | null = null;
    if (actualMean !== null && (t.minValue !== null || t.maxValue !== null)) {
      const aboveMin = t.minValue === null || actualMean.greaterThanOrEqualTo(t.minValue);
      const belowMax = t.maxValue === null || actualMean.lessThanOrEqualTo(t.maxValue);
      withinRange = aboveMin && belowMax;
    }

    return {
      variable: t.variable,
      moment: t.moment,
      unit: t.unit,
      note: t.note,
      target: { value: t.targetValue, min: t.minValue, max: t.maxValue },
      actual: { readings, mean: actualMean, method: actualMean === null ? null : "mean_of_readings" },
      deviation,
      withinRange,
      ambiguousSingleReading: ambiguous,
    };
  });
}
