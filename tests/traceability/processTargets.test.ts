/**
 * Target versus actual — ADR-098.
 *
 * The product owner's example, made executable: target pH 3.8, take a few
 * readings, average them, and see 3.785 against 3.8.
 *
 * The assertions that matter most are the ones about what is *not* lost. A
 * mean that replaced its readings would satisfy a naive test and violate
 * CLAUDE.md §49 — three readings of 3.7/3.8/3.9 and three of 3.78/3.79/3.79
 * have the same mean and mean different things.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { compareRunToTargets, ProcessTargetError } from "../../lib/traceability/processTargets";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `ptgt-${Date.now()}`;

let admin: string;
let lotId: string;
let runWithRecipe: string;
let runWithoutRecipe: string;
let recipeId: string;

const created = {
  measurementIds: [] as string[],
  transformationIds: [] as string[],
  runIds: [] as string[],
  lotIds: [] as string[],
  recipeIds: [] as string[],
  organizationIds: [] as string[],
};

/** Creates a fermentation run tied to `lotId`, optionally against a recipe version. */
async function makeRun(recipeVersionId: string | null, startedAt: Date) {
  const run = await prisma.fermentationRun.create({
    data: { startedAt, vesselNote: `PTGT ${RUN}`, processRecipeVersionId: recipeVersionId },
  });
  const tx = await prisma.lotTransformation.create({
    data: {
      transformationType: "stage_change",
      occurredAt: startedAt,
      provenanceClass: "direct_observation",
      fermentationRunId: run.id,
      inputs: { create: [{ lotId }] },
    },
  });
  created.runIds.push(run.id);
  created.transformationIds.push(tx.id);
  return run.id;
}

async function addReading(runId: string, variable: string, value: number, minutesIn: number) {
  const m = await prisma.measurement.create({
    data: {
      variable,
      value,
      unit: variable === "ph" ? "pH" : "Bx",
      occurredAt: new Date(Date.UTC(2026, 0, 1, 0, minutesIn)),
      lotId,
      fermentationRunId: runId,
      provenanceClass: "direct_observation",
    },
  });
  created.measurementIds.push(m.id);
  return m.id;
}

beforeAll(async () => {
  admin = (
    await prisma.assignment.findFirstOrThrow({
      where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
      select: { userAccountId: true },
    })
  ).userAccountId;

  const org = await prisma.organization.create({
    data: { name: `PTGT Org ${RUN}`, organizationType: "farm" },
  });
  created.organizationIds.push(org.id);

  const lot = await prisma.lot.create({
    data: { lotCode: `PTGT-${RUN}`, lotType: "cherry", organizationId: org.id, classification: "internal" },
  });
  lotId = lot.id;
  created.lotIds.push(lot.id);

  // A recipe with three targets: an initial Brix, a pH during, and a final pH.
  // The same variable targeted at two moments is the ordinary case, not an
  // edge case — original and final gravity is exactly this shape.
  const recipe = await prisma.processRecipe.create({
    data: {
      name: `PTGT Lavado ${RUN}`,
      organizationId: org.id,
      versions: {
        create: {
          version: 1,
          status: "approved",
          targets: {
            create: [
              { variable: "brix", moment: "initial", targetValue: 22, unit: "Bx", displayOrder: 0 },
              { variable: "ph", moment: "during", minValue: 4.0, maxValue: 5.0, unit: "pH", displayOrder: 1 },
              { variable: "ph", moment: "final", targetValue: 3.8, unit: "pH", displayOrder: 2 },
            ],
          },
        },
      },
    },
    include: { versions: true },
  });
  recipeId = recipe.id;
  created.recipeIds.push(recipe.id);

  runWithRecipe = await makeRun(recipe.versions[0]!.id, new Date(Date.UTC(2026, 0, 1)));
  runWithoutRecipe = await makeRun(null, new Date(Date.UTC(2026, 0, 2)));

  // Brix once at the start; pH three times, ending at the product owner's own
  // example figure.
  await addReading(runWithRecipe, "brix", 21.4, 0);
  await addReading(runWithRecipe, "ph", 4.6, 10);
  await addReading(runWithRecipe, "ph", 4.1, 20);
  await addReading(runWithRecipe, "ph", 3.785, 30);
});

afterAll(async () => {
  // ADR-045 — never a deleteMany whose where clause could silently become {}.
  const w = (ids: string[]) => assertDefinedWhere({ id: { in: ids } });
  if (created.measurementIds.length) await prisma.measurement.deleteMany({ where: w(created.measurementIds) });
  if (created.transformationIds.length) {
    await prisma.lotTransformationInput.deleteMany({
      where: assertDefinedWhere({ transformationId: { in: created.transformationIds } }),
    });
    await prisma.lotTransformation.deleteMany({ where: w(created.transformationIds) });
  }
  if (created.runIds.length) await prisma.fermentationRun.deleteMany({ where: w(created.runIds) });
  if (created.recipeIds.length) await prisma.processRecipe.deleteMany({ where: w(created.recipeIds) });
  if (created.lotIds.length) await prisma.lot.deleteMany({ where: w(created.lotIds) });
  if (created.organizationIds.length) await prisma.organization.deleteMany({ where: w(created.organizationIds) });

  // ADR-086's lesson: assert the cleanup worked rather than assume it.
  expect(await prisma.processRecipe.count({ where: { name: { contains: RUN } } })).toBe(0);
});

describe("the product owner's example, end to end", () => {
  it("reports the final pH against its target", async () => {
    const rows = await compareRunToTargets(admin, runWithRecipe);
    const finalPh = rows.find((r) => r.variable === "ph" && r.moment === "final")!;

    expect(finalPh.target.value?.toNumber()).toBe(3.8);
    expect(finalPh.actual.mean?.toNumber()).toBe(3.785);
    // 3.785 − 3.8. Asserted to four places because pH is stored at that
    // precision and a rounded comparison would hide exactly the small
    // deviation this feature exists to show.
    expect(finalPh.deviation?.toNumber()).toBeCloseTo(-0.015, 4);
  });

  it("averages the readings taken during the run, and keeps every one of them", async () => {
    // The assertion that matters: §49 forbids replacing raw measurement with a
    // calculated value. A mean that dropped its inputs would pass a lazier
    // test and lose the spread.
    const rows = await compareRunToTargets(admin, runWithRecipe);
    const duringPh = rows.find((r) => r.variable === "ph" && r.moment === "during")!;

    expect(duringPh.actual.readings.length).toBe(3);
    expect(duringPh.actual.readings.map((r) => r.value.toNumber())).toEqual([4.6, 4.1, 3.785]);
    expect(duringPh.actual.mean?.toNumber()).toBeCloseTo((4.6 + 4.1 + 3.785) / 3, 6);
  });

  it("names how the mean was arrived at — §28", () => {
    // A derived metric that does not carry its method is a number nobody can
    // audit later.
    return compareRunToTargets(admin, runWithRecipe).then((rows) => {
      const duringPh = rows.find((r) => r.variable === "ph" && r.moment === "during")!;
      expect(duringPh.actual.method).toBe("mean_of_readings");
    });
  });
});

describe("ranges", () => {
  it("says whether the average fell inside the declared range", async () => {
    const rows = await compareRunToTargets(admin, runWithRecipe);
    const duringPh = rows.find((r) => r.variable === "ph" && r.moment === "during")!;
    // Mean is ~4.16, declared range 4.0–5.0.
    expect(duringPh.withinRange).toBe(true);
  });

  it("returns null for withinRange when no range was declared", async () => {
    // Null is not "outside". A target with only a point value has no range to
    // fall inside or out of, and saying `false` would be an assertion nobody
    // made.
    const rows = await compareRunToTargets(admin, runWithRecipe);
    const finalPh = rows.find((r) => r.variable === "ph" && r.moment === "final")!;
    expect(finalPh.withinRange).toBeNull();
  });
});

describe("what it refuses to assert", () => {
  it("flags a single reading serving as both initial and final", async () => {
    // Brix was measured once. That reading is the initial value; it cannot
    // truthfully also be a final one, and the flag is how the page says so
    // rather than quietly reporting a deviation of zero.
    const rows = await compareRunToTargets(admin, runWithRecipe);
    const brix = rows.find((r) => r.variable === "brix")!;
    expect(brix.actual.readings.length).toBe(1);
    expect(brix.ambiguousSingleReading).toBe(true);
    expect(brix.deviation?.toNumber()).toBeCloseTo(21.4 - 22, 4);
  });

  it("returns an empty comparison for a run with no recipe, not an error", async () => {
    // Most existing runs are in this state, and improvising without a recipe
    // is legitimate. "Nothing was declared" is an honest empty result.
    expect(await compareRunToTargets(admin, runWithoutRecipe)).toEqual([]);
  });

  it("refuses a run that does not exist rather than returning nothing", async () => {
    await expect(
      compareRunToTargets(admin, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });
});

describe("versions are immutable", () => {
  it("a run points at the version, so a later version cannot rewrite its targets", async () => {
    // CLAUDE.md §3. Adding version 2 with a different target must leave the
    // existing run comparing against what it was actually operated to.
    await prisma.processRecipeVersion.create({
      data: {
        recipeId,
        version: 2,
        status: "approved",
        targets: { create: [{ variable: "ph", moment: "final", targetValue: 4.2, unit: "pH", displayOrder: 0 }] },
      },
    });

    const rows = await compareRunToTargets(admin, runWithRecipe);
    const finalPh = rows.find((r) => r.variable === "ph" && r.moment === "final")!;
    expect(finalPh.target.value?.toNumber()).toBe(3.8);
  });
});
