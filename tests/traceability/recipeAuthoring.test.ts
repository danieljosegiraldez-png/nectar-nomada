/**
 * Creating a recipe — ADR-100.
 *
 * The interesting cases are the refusals. A recipe is read by the comparison
 * table for the rest of a run's life, so a target that is wrong at creation is
 * wrong in every reading of that run afterwards — a pH target of 15 would
 * report a deviation of −11 forever, and look like a process problem rather
 * than a typo.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import {
  createRecipeWithVersion,
  listRecipeVersionsForLot,
  ProcessTargetError,
} from "../../lib/traceability/processTargets";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `recipe-${Date.now()}`;

let admin: string;
let organizationId: string;
let lotId: string;
const created = { recipeIds: [] as string[], lotIds: [] as string[], organizationIds: [] as string[] };

const oneTarget = [{ variable: "ph", moment: "final" as const, unit: "pH", targetValue: 3.8 }];

beforeAll(async () => {
  admin = (
    await prisma.assignment.findFirstOrThrow({
      where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
      select: { userAccountId: true },
    })
  ).userAccountId;

  const org = await prisma.organization.create({
    data: { name: `RECIPE Org ${RUN}`, organizationType: "farm" },
  });
  organizationId = org.id;
  created.organizationIds.push(org.id);

  const lot = await prisma.lot.create({
    data: { lotCode: `RECIPE-${RUN}`, lotType: "cherry", organizationId, classification: "internal" },
  });
  lotId = lot.id;
  created.lotIds.push(lot.id);
});

afterAll(async () => {
  const w = (ids: string[]) => assertDefinedWhere({ id: { in: ids } });
  if (created.recipeIds.length) {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: created.recipeIds } }) });
  }
  // Deleted by RUN prefix, not only by tracked id — ADR-104.
  //
  // Every refusal case here names a recipe it expects never to exist, so its
  // id is never captured. Under normal conditions that is fine, because the
  // creation was refused. Under a *mutation* run it is not: disabling the
  // physical-bounds check let "RECIPE Impossible …" be created, the test
  // failed as designed, and the row survived every subsequent run because
  // nothing had recorded it.
  //
  // One was found in the local database days later. The tracked-id list stays
  // for the audit rows above, which have no name to match on.
  await prisma.processRecipe.deleteMany({
    where: assertDefinedWhere({ name: { contains: RUN } }),
  });
  if (created.lotIds.length) await prisma.lot.deleteMany({ where: w(created.lotIds) });
  if (created.organizationIds.length) await prisma.organization.deleteMany({ where: w(created.organizationIds) });

  expect(await prisma.processRecipe.count({ where: { name: { contains: RUN } } })).toBe(0);
});

describe("creating a recipe", () => {
  it("creates the recipe and its first version together", async () => {
    // There is no useful recipe with no version — a name with no targets
    // declares nothing — so the two are one operation.
    const recipe = await createRecipeWithVersion(admin, {
      name: `RECIPE Lavado ${RUN}`,
      organizationId,
      targets: [
        { variable: "brix", moment: "initial", unit: "Bx", targetValue: 22 },
        { variable: "ph", moment: "final", unit: "pH", targetValue: 3.8, note: "fin de fermentación" },
      ],
    });
    created.recipeIds.push(recipe.id);

    expect(recipe.versions.length).toBe(1);
    expect(recipe.versions[0]!.version).toBe(1);
    expect(recipe.versions[0]!.targets.length).toBe(2);
    // Approved on creation, so it is immediately selectable — a draft nobody
    // can attach would be a recipe that does nothing.
    expect(recipe.versions[0]!.status).toBe("approved");
  });

  it("offers the new version when starting a run on that organization's batch", async () => {
    const versions = await listRecipeVersionsForLot(admin, lotId);
    expect(versions.map((v) => v.recipe.name)).toContain(`RECIPE Lavado ${RUN}`);
  });

  it("writes an audit row", async () => {
    const event = await prisma.auditEvent.findFirst({
      where: { entityType: "process_recipe", entityId: created.recipeIds[0] },
    });
    expect(event?.operation).toBe("process_recipe.create");
  });
});

describe("what it refuses", () => {
  it("refuses a recipe with no name", async () => {
    await expect(
      createRecipeWithVersion(admin, { name: "   ", organizationId, targets: oneTarget }),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses a recipe with no targets — a name declares nothing", async () => {
    await expect(
      createRecipeWithVersion(admin, { name: `RECIPE Empty ${RUN}`, organizationId, targets: [] }),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses a target carrying no number at all", async () => {
    // "Measure pH at the end" without a value is an instruction to measure,
    // which is what ProtocolRequiredMeasurement is for. Accepting it here
    // would put a row in the comparison table with nothing to compare.
    await expect(
      createRecipeWithVersion(admin, {
        name: `RECIPE NoNumber ${RUN}`,
        organizationId,
        targets: [{ variable: "ph", moment: "final", unit: "pH" }],
      }),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses an inverted range", async () => {
    await expect(
      createRecipeWithVersion(admin, {
        name: `RECIPE Inverted ${RUN}`,
        organizationId,
        targets: [{ variable: "ph", moment: "during", unit: "pH", minValue: 5, maxValue: 4 }],
      }),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses a target outside the variable's physical range", async () => {
    // The case this validation exists for. pH 15 does not exist, and a
    // comparison table would otherwise report a deviation of −11 for the rest
    // of the run's life — looking like a process problem rather than a typo.
    await expect(
      createRecipeWithVersion(admin, {
        name: `RECIPE Impossible ${RUN}`,
        organizationId,
        targets: [{ variable: "ph", moment: "final", unit: "pH", targetValue: 15 }],
      }),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses a unit that does not belong to the variable", async () => {
    // A pH target recorded in Brix would compare against Brix readings and
    // silently misreport. The form does not let this happen; the service
    // refuses it anyway, because the form is not the boundary.
    await expect(
      createRecipeWithVersion(admin, {
        name: `RECIPE WrongUnit ${RUN}`,
        organizationId,
        targets: [{ variable: "ph", moment: "final", unit: "Bx", targetValue: 4 }],
      }),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses a variable that is not in the registry", async () => {
    await expect(
      createRecipeWithVersion(admin, {
        name: `RECIPE Unknown ${RUN}`,
        organizationId,
        targets: [{ variable: "vibes", moment: "final", unit: "x", targetValue: 1 }],
      }),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("leaves nothing behind when it refuses", async () => {
    // A recipe row created before validation failed would be an invisible
    // half-record — the same shape as ADR-089's abandoned backup directory.
    expect(await prisma.processRecipe.count({ where: { name: { contains: `RECIPE Impossible ${RUN}` } } })).toBe(0);
    expect(await prisma.processRecipe.count({ where: { name: { contains: `RECIPE Empty ${RUN}` } } })).toBe(0);
  });
});
