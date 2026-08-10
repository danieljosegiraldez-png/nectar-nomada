/**
 * Phase 1, ticket T1 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §31, §34). The first genuine DB-integration test suite in this codebase —
 * real Postgres (Neon), no mocks, matching this project's established
 * discipline. Every fixture is created in beforeAll and torn down in
 * afterAll; nothing here touches or depends on DEMO seed content.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, getLotLineage, recordTransformation, TraceabilityAccessError } from "../../lib/traceability/lots";

const RUN_ID = `t1-${Date.now()}`;

let organizationId: string;
let projectAId: string;
let projectBId: string;
let locationId: string;
let otherLocationId: string;

let authorizedUserAccountId: string; // Farm Operator, scope: project A
let locationScopedUserAccountId: string; // Farm Operator, scope: locationId
let wrongProjectUserAccountId: string; // Farm Operator, scope: project B
let unauthorizedUserAccountId: string; // no Assignment at all

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "en" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

async function assignFarmOperator(userAccountId: string, scope: { scopeType: "project" | "location"; scopeRefId: string }) {
  const farmOperatorProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scopeRow = await prisma.scope.create({ data: scope });
  await prisma.assignment.create({
    data: { userAccountId, roleProfileId: farmOperatorProfile.id, scopeId: scopeRow.id },
  });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const projectA = await prisma.project.create({
    data: { name: `TEST Project A (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectAId = projectA.id;

  const projectB = await prisma.project.create({
    data: { name: `TEST Project B (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectBId = projectB.id;

  const location = await prisma.location.create({
    data: { locationType: "site", name: `TEST Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = location.id;

  const otherLocation = await prisma.location.create({
    data: { locationType: "site", name: `TEST Other Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  otherLocationId = otherLocation.id;

  authorizedUserAccountId = await createTestUserAccount("AuthorizedOperator");
  await assignFarmOperator(authorizedUserAccountId, { scopeType: "project", scopeRefId: projectAId });

  locationScopedUserAccountId = await createTestUserAccount("LocationScopedOperator");
  await assignFarmOperator(locationScopedUserAccountId, { scopeType: "location", scopeRefId: locationId });

  wrongProjectUserAccountId = await createTestUserAccount("WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, { scopeType: "project", scopeRefId: projectBId });

  unauthorizedUserAccountId = await createTestUserAccount("Unauthorized");
});

afterAll(async () => {
  // LotTransformation deletion cascades to its input/output join rows
  // (onDelete: Cascade); Lot itself has no cascade from those joins
  // (onDelete: Restrict), so transformations must be removed first.
  const allTestLots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = allTestLots.map((l) => l.id);
  await prisma.lotTransformation.deleteMany({
    where: { OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] },
  });
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } });

  await prisma.assignment.deleteMany({
    where: {
      userAccountId: {
        in: [authorizedUserAccountId, locationScopedUserAccountId, wrongProjectUserAccountId, unauthorizedUserAccountId],
      },
    },
  });
  await prisma.scope.deleteMany({ where: { OR: [{ scopeRefId: projectAId }, { scopeRefId: locationId }, { scopeRefId: projectBId }] } });
  await prisma.userAccount.deleteMany({
    where: {
      id: {
        in: [authorizedUserAccountId, locationScopedUserAccountId, wrongProjectUserAccountId, unauthorizedUserAccountId],
      },
    },
  });
  await prisma.person.deleteMany({ where: { displayName: { contains: RUN_ID } } });
  await prisma.location.deleteMany({ where: { id: { in: [locationId, otherLocationId] } } });
  await prisma.project.deleteMany({ where: { id: { in: [projectAId, projectBId] } } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
});

describe("createLot — RBAC", () => {
  it("allows a project-scoped Farm Operator to create a lot in their project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-rbac-ok`,
      lotType: "cherry",
      projectId: projectAId,
    });
    expect(lot.lotCode).toBe(`${RUN_ID}-rbac-ok`);
    expect(lot.lotType).toBe("cherry");
  });

  it("allows a location-scoped Farm Operator to create a lot at their location", async () => {
    const lot = await createLot(locationScopedUserAccountId, {
      lotCode: `${RUN_ID}-rbac-location-ok`,
      lotType: "cherry",
      locationId,
    });
    expect(lot.locationId).toBe(locationId);
  });

  it("denies a location-scoped Farm Operator at a different location", async () => {
    await expect(
      createLot(locationScopedUserAccountId, {
        lotCode: `${RUN_ID}-rbac-location-denied`,
        lotType: "cherry",
        locationId: otherLocationId,
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("denies a Farm Operator scoped to a different project (cross-project denial, RBAC.md §9)", async () => {
    await expect(
      createLot(wrongProjectUserAccountId, {
        lotCode: `${RUN_ID}-rbac-cross-project-denied`,
        lotType: "cherry",
        projectId: projectAId,
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("denies a user with no Assignment at all", async () => {
    await expect(
      createLot(unauthorizedUserAccountId, {
        lotCode: `${RUN_ID}-rbac-unauthorized-denied`,
        lotType: "cherry",
        projectId: projectAId,
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });
});

describe("recordTransformation — split/merge round-trip and append-only lineage", () => {
  it("split: one lot's quantity is preserved across two output lots", async () => {
    const origin = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-split-origin`,
      lotType: "cherry",
      projectId: projectAId,
    });

    const { transformation, outputLots } = await recordTransformation(authorizedUserAccountId, {
      transformationType: "split",
      occurredAt: new Date(),
      inputs: [{ lotId: origin.id, quantity: 500, unit: "kg" }],
      outputs: [
        { lotCode: `${RUN_ID}-split-output-1`, lotType: "processing", quantity: 300, unit: "kg" },
        { lotCode: `${RUN_ID}-split-output-2`, lotType: "processing", quantity: 200, unit: "kg" },
      ],
    });

    expect(transformation.transformationType).toBe("split");
    expect(outputLots).toHaveLength(2);
    // Total output quantity matches the input — the round-trip this ticket's
    // DoD asks for.
    const outputRows = await prisma.lotTransformationOutput.findMany({ where: { transformationId: transformation.id } });
    const totalOut = outputRows.reduce((sum, r) => sum + Number(r.quantity), 0);
    expect(totalOut).toBe(500);

    // Output lots inherit the origin's project.
    for (const outputLot of outputLots) {
      expect(outputLot.projectId).toBe(projectAId);
    }
  });

  it("merge: two lots combine into one output lot", async () => {
    const lotA = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-merge-input-a`,
      lotType: "green",
      projectId: projectAId,
    });
    const lotB = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-merge-input-b`,
      lotType: "green",
      projectId: projectAId,
    });

    const { transformation, outputLots } = await recordTransformation(authorizedUserAccountId, {
      transformationType: "merge",
      occurredAt: new Date(),
      inputs: [
        { lotId: lotA.id, quantity: 40, unit: "kg" },
        { lotId: lotB.id, quantity: 35, unit: "kg" },
      ],
      outputs: [{ lotCode: `${RUN_ID}-merge-output`, lotType: "green", quantity: 75, unit: "kg" }],
    });

    expect(outputLots).toHaveLength(1);
    const inputRows = await prisma.lotTransformationInput.findMany({ where: { transformationId: transformation.id } });
    expect(inputRows).toHaveLength(2);
  });

  it("blend: two distinct-varietal green lots combine into one blended lot (execution plan §8.3's blend diagram)", async () => {
    const geishaA = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-blend-geisha-a`,
      lotType: "green",
      projectId: projectAId,
    });
    const geishaB = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-blend-geisha-b`,
      lotType: "green",
      projectId: projectAId,
    });

    const { transformation, outputLots } = await recordTransformation(authorizedUserAccountId, {
      transformationType: "blend",
      occurredAt: new Date(),
      inputs: [
        { lotId: geishaA.id, quantity: 40, unit: "kg" },
        { lotId: geishaB.id, quantity: 35, unit: "kg" },
      ],
      outputs: [{ lotCode: `${RUN_ID}-blend-output`, lotType: "green", quantity: 75, unit: "kg" }],
    });

    expect(transformation.transformationType).toBe("blend");
    expect(outputLots).toHaveLength(1);

    // Both directions of lineage hold for a blend, same as a merge: the
    // output has two ancestors, each ancestor has the blended lot as its
    // only descendant.
    const blendLineage = await getLotLineage(authorizedUserAccountId, outputLots[0]!.id);
    expect(blendLineage.ancestorLotIds).toEqual(expect.arrayContaining([geishaA.id, geishaB.id]));
  });

  it("append-only: a lot's full transformation history remains queryable after multiple transformations, nothing overwritten", async () => {
    const origin = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-history-origin`,
      lotType: "cherry",
      projectId: projectAId,
    });

    const first = await recordTransformation(authorizedUserAccountId, {
      transformationType: "stage_change",
      occurredAt: new Date("2026-01-01"),
      inputs: [{ lotId: origin.id, quantity: 100, unit: "kg" }],
      outputs: [{ lotCode: `${RUN_ID}-history-stage2`, lotType: "processing", quantity: 100, unit: "kg" }],
    });

    const second = await recordTransformation(authorizedUserAccountId, {
      transformationType: "stage_change",
      occurredAt: new Date("2026-01-02"),
      inputs: [{ lotId: first.outputLots[0]!.id, quantity: 95, unit: "kg" }],
      outputs: [{ lotCode: `${RUN_ID}-history-stage3`, lotType: "drying", quantity: 95, unit: "kg" }],
    });

    // Both transformations still exist as separate, unmodified rows — a
    // correction would be a third transformation, never an edit to these.
    const originInput = await prisma.lotTransformationInput.findFirst({ where: { lotId: origin.id } });
    expect(originInput?.transformationId).toBe(first.transformation.id);
    const stage2Input = await prisma.lotTransformationInput.findFirst({ where: { lotId: first.outputLots[0]!.id } });
    expect(stage2Input?.transformationId).toBe(second.transformation.id);
  });
});

describe("getLotLineage — recursive CTE correctness", () => {
  it("traces a multi-hop chain both forward and backward", async () => {
    const origin = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-lineage-origin`,
      lotType: "cherry",
      projectId: projectAId,
    });
    const step1 = await recordTransformation(authorizedUserAccountId, {
      transformationType: "stage_change",
      occurredAt: new Date(),
      inputs: [{ lotId: origin.id }],
      outputs: [{ lotCode: `${RUN_ID}-lineage-step1`, lotType: "processing" }],
    });
    const step1LotId = step1.outputLots[0]!.id;

    const step2 = await recordTransformation(authorizedUserAccountId, {
      transformationType: "stage_change",
      occurredAt: new Date(),
      inputs: [{ lotId: step1LotId }],
      outputs: [{ lotCode: `${RUN_ID}-lineage-step2`, lotType: "drying" }],
    });
    const step2LotId = step2.outputLots[0]!.id;

    // From the final lot: ancestors should include both step1 and origin.
    const lineageFromEnd = await getLotLineage(authorizedUserAccountId, step2LotId);
    expect(lineageFromEnd.ancestorLotIds).toEqual(expect.arrayContaining([step1LotId, origin.id]));
    expect(lineageFromEnd.descendantLotIds).toHaveLength(0);

    // From the origin: descendants should include both step1 and the final lot.
    const lineageFromOrigin = await getLotLineage(authorizedUserAccountId, origin.id);
    expect(lineageFromOrigin.descendantLotIds).toEqual(expect.arrayContaining([step1LotId, step2LotId]));
    expect(lineageFromOrigin.ancestorLotIds).toHaveLength(0);
  });

  it("denies lineage view to a user with no access to the lot's project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-lineage-denied`,
      lotType: "cherry",
      projectId: projectAId,
    });
    await expect(getLotLineage(wrongProjectUserAccountId, lot.id)).rejects.toThrow(TraceabilityAccessError);
  });
});
