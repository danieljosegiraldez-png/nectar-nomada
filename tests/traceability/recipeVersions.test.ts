/**
 * Editing a recipe, and superseding it with a new version — ADR-101.
 *
 * The distinction under test is the one CLAUDE.md §3 exists for: a name is a
 * label and may be edited; targets are what runs were operated against and may
 * only be superseded. A test that let the two blur would let the platform
 * rewrite history quietly.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import {
  createRecipeWithVersion,
  createRecipeVersion,
  updateRecipeMetadata,
  getRecipeForEditor,
  listRecipeVersionsForLot,
  compareRunToTargets,
  ProcessTargetError,
} from "../../lib/traceability/processTargets";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `rver-${Date.now()}`;

let admin: string;
let organizationId: string;
let lotId: string;
let recipeId: string;
let v1Id: string;
let runOnV1: string;
const created = {
  recipeIds: [] as string[], lotIds: [] as string[], organizationIds: [] as string[],
  runIds: [] as string[], transformationIds: [] as string[], measurementIds: [] as string[],
};

beforeAll(async () => {
  admin = (
    await prisma.assignment.findFirstOrThrow({
      where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
      select: { userAccountId: true },
    })
  ).userAccountId;

  const org = await prisma.organization.create({ data: { name: `RVER Org ${RUN}`, organizationType: "farm" } });
  organizationId = org.id;
  created.organizationIds.push(org.id);

  const lot = await prisma.lot.create({
    data: { lotCode: `RVER-${RUN}`, lotType: "cherry", organizationId, classification: "internal" },
  });
  lotId = lot.id;
  created.lotIds.push(lot.id);

  const recipe = await createRecipeWithVersion(admin, {
    name: `RVER Lavado ${RUN}`,
    organizationId,
    targets: [{ variable: "ph", moment: "final", unit: "pH", targetValue: 3.8 }],
  });
  recipeId = recipe.id;
  v1Id = recipe.versions[0]!.id;
  created.recipeIds.push(recipe.id);

  // A run operated against version 1, so the history has something to protect.
  const run = await prisma.fermentationRun.create({
    data: { startedAt: new Date(), vesselNote: `RVER ${RUN}`, processRecipeVersionId: v1Id },
  });
  runOnV1 = run.id;
  created.runIds.push(run.id);
  const tx = await prisma.lotTransformation.create({
    data: {
      transformationType: "stage_change", occurredAt: run.startedAt,
      provenanceClass: "direct_observation", fermentationRunId: run.id,
      inputs: { create: [{ lotId }] },
    },
  });
  created.transformationIds.push(tx.id);
  const m = await prisma.measurement.create({
    data: { variable: "ph", value: 3.785, unit: "pH", occurredAt: new Date(),
            lotId, fermentationRunId: run.id, provenanceClass: "direct_observation" },
  });
  created.measurementIds.push(m.id);
});

afterAll(async () => {
  const w = (ids: string[]) => assertDefinedWhere({ id: { in: ids } });
  if (created.measurementIds.length) await prisma.measurement.deleteMany({ where: w(created.measurementIds) });
  if (created.transformationIds.length) {
    await prisma.lotTransformationInput.deleteMany({
      where: assertDefinedWhere({ transformationId: { in: created.transformationIds } }),
    });
    await prisma.lotTransformation.deleteMany({ where: w(created.transformationIds) });
  }
  if (created.runIds.length) await prisma.fermentationRun.deleteMany({ where: w(created.runIds) });
  if (created.recipeIds.length) {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: created.recipeIds } }) });
    await prisma.processRecipe.deleteMany({ where: w(created.recipeIds) });
  }
  if (created.lotIds.length) await prisma.lot.deleteMany({ where: w(created.lotIds) });
  if (created.organizationIds.length) await prisma.organization.deleteMany({ where: w(created.organizationIds) });

  expect(await prisma.processRecipe.count({ where: { name: { contains: RUN } } })).toBe(0);
});

describe("a name may be edited; targets may not", () => {
  it("renames the recipe without touching any version", async () => {
    // Correcting a typo in a label changes nothing about what any run was
    // aiming for, which is exactly why this is an edit and targets are not.
    await updateRecipeMetadata(admin, recipeId, {
      name: `RVER Lavado tradicional ${RUN}`,
      description: "corregido",
    });

    const recipe = await getRecipeForEditor(admin, recipeId);
    expect(recipe.name).toBe(`RVER Lavado tradicional ${RUN}`);
    expect(recipe.versions.length).toBe(1);
    expect(recipe.versions[0]!.targets[0]!.targetValue?.toNumber()).toBe(3.8);
  });

  it("audits the rename with both sides", async () => {
    const event = await prisma.auditEvent.findFirst({
      where: { entityId: recipeId, operation: "process_recipe.update" },
      orderBy: { occurredAt: "desc" },
    });
    expect(event).not.toBeNull();
    expect((event!.before as Record<string, unknown>).name).toContain("RVER Lavado ");
    expect((event!.after as Record<string, unknown>).name).toContain("tradicional");
  });
});

describe("creating version 2", () => {
  it("numbers it from the highest existing version", async () => {
    const v2 = await createRecipeVersion(
      admin, recipeId,
      [{ variable: "ph", moment: "final", unit: "pH", targetValue: 4.0 }],
      "subimos el objetivo",
    );
    expect(v2.version).toBe(2);
    expect(v2.targets[0]!.targetValue?.toNumber()).toBe(4);
  });

  it("leaves the run on version 1 comparing against 3.8, not 4.0", async () => {
    // The whole reason versions exist. If this ever returns 4.0, the platform
    // has rewritten what a past run was aiming for.
    const rows = await compareRunToTargets(admin, runOnV1);
    expect(rows[0]!.target.value?.toNumber()).toBe(3.8);
    expect(rows[0]!.deviation?.toNumber()).toBeCloseTo(-0.015, 4);
  });

  it("records which version it supersedes", async () => {
    const event = await prisma.auditEvent.findFirst({
      where: { operation: "process_recipe_version.create" },
      orderBy: { occurredAt: "desc" },
    });
    expect(event?.reason).toBe("supersedes_version_1");
  });

  it("shows version 1 as used by a run, so the page can refuse to treat it as scratch", async () => {
    const recipe = await getRecipeForEditor(admin, recipeId);
    const v1 = recipe.versions.find((v) => v.version === 1)!;
    const v2 = recipe.versions.find((v) => v.version === 2)!;
    expect(v1._count.fermentationRuns).toBe(1);
    expect(v2._count.fermentationRuns).toBe(0);
  });
});

describe("only the newest version is offered for a new run", () => {
  it("returns version 2 and not version 1", async () => {
    // Before versions could be created this returned everything approved,
    // which was the same thing because there was only ever one. The moment v2
    // exists, offering both asks the operator to know which is current.
    const offered = await listRecipeVersionsForLot(admin, lotId);
    const mine = offered.filter((v) => v.recipeId === recipeId);
    expect(mine.length).toBe(1);
    expect(mine[0]!.version).toBe(2);
  });
});

describe("a new version is validated like a first one", () => {
  it("refuses an impossible value", async () => {
    await expect(
      createRecipeVersion(admin, recipeId, [{ variable: "ph", moment: "final", unit: "pH", targetValue: 15 }]),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses two targets for the same variable and moment", async () => {
    // The unique index would catch this as a P2002 the operator cannot read.
    // Catching it first names the actual mistake.
    await expect(
      createRecipeVersion(admin, recipeId, [
        { variable: "ph", moment: "final", unit: "pH", targetValue: 3.8 },
        { variable: "ph", moment: "final", unit: "pH", targetValue: 4.0 },
      ]),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses an empty set of targets", async () => {
    await expect(createRecipeVersion(admin, recipeId, [])).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("created no version when it refused", async () => {
    const recipe = await getRecipeForEditor(admin, recipeId);
    expect(recipe.versions.map((v) => v.version).sort()).toEqual([1, 2]);
  });
});
