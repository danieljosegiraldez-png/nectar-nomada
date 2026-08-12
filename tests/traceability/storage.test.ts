/**
 * Phase 1, ticket T8 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §34). Real Postgres (Neon), no mocks. DoD: "Moving storage preserves
 * prior assignment's history."
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, TraceabilityAccessError } from "../../lib/traceability/lots";
import { getCurrentStorageAssignment, moveLotToStorage } from "../../lib/traceability/storage";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `t8-${Date.now()}`;

let projectAId: string;
let projectBId: string;
let organizationId: string;
let locationAId: string;
let locationBId: string;

let authorizedUserAccountId: string; // Farm Operator, scope: project A
let wrongProjectUserAccountId: string; // Farm Operator, scope: project B

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "en" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

async function assignFarmOperator(userAccountId: string, scope: { scopeType: "project"; scopeRefId: string }) {
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

  const locationA = await prisma.location.create({
    data: { locationType: "site", name: `TEST Warehouse A (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationAId = locationA.id;

  const locationB = await prisma.location.create({
    data: { locationType: "site", name: `TEST Warehouse B (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationBId = locationB.id;

  const projectA = await prisma.project.create({
    data: { name: `TEST Project A (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectAId = projectA.id;

  const projectB = await prisma.project.create({
    data: { name: `TEST Project B (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectBId = projectB.id;

  authorizedUserAccountId = await createTestUserAccount("AuthorizedOperator");
  await assignFarmOperator(authorizedUserAccountId, { scopeType: "project", scopeRefId: projectAId });

  wrongProjectUserAccountId = await createTestUserAccount("WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, { scopeType: "project", scopeRefId: projectBId });
});

afterAll(async () => {
  const testLots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = testLots.map((l) => l.id);

  await prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });

  await prisma.assignment.deleteMany({
    where: assertDefinedWhere({ userAccountId: { in: [authorizedUserAccountId, wrongProjectUserAccountId] } }),
  });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }] }) });
  await prisma.userAccount.deleteMany({
    where: assertDefinedWhere({ id: { in: [authorizedUserAccountId, wrongProjectUserAccountId] } }),
  });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [locationAId, locationBId] } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectAId, projectBId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("moveLotToStorage — location-history preservation", () => {
  it("creates the first storage assignment as the current, open one", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-first-move`,
      lotType: "green",
      projectId: projectAId,
    });

    const assignment = await moveLotToStorage(authorizedUserAccountId, {
      lotId: lot.id,
      locationId: locationAId,
      containerNote: "Bag #14",
      startedAt: new Date("2026-01-01"),
    });

    expect(assignment.locationId).toBe(locationAId);
    expect(assignment.endedAt).toBeNull();

    const current = await getCurrentStorageAssignment(authorizedUserAccountId, lot.id);
    expect(current?.id).toBe(assignment.id);
  });

  it("moving storage closes the prior assignment (endedAt set once) without deleting or overwriting it", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-second-move`,
      lotType: "green",
      projectId: projectAId,
    });

    const first = await moveLotToStorage(authorizedUserAccountId, {
      lotId: lot.id,
      locationId: locationAId,
      startedAt: new Date("2026-01-01"),
    });

    const second = await moveLotToStorage(authorizedUserAccountId, {
      lotId: lot.id,
      locationId: locationBId,
      startedAt: new Date("2026-01-10"),
    });

    const firstReloaded = await prisma.storageAssignment.findUniqueOrThrow({ where: { id: first.id } });
    expect(firstReloaded.endedAt).toEqual(new Date("2026-01-10"));
    expect(firstReloaded.locationId).toBe(locationAId); // never mutated in place

    expect(second.endedAt).toBeNull();
    expect(second.locationId).toBe(locationBId);

    // Full history remains queryable — both rows still exist.
    const allAssignments = await prisma.storageAssignment.findMany({ where: { lotId: lot.id }, orderBy: { startedAt: "asc" } });
    expect(allAssignments).toHaveLength(2);

    const current = await getCurrentStorageAssignment(authorizedUserAccountId, lot.id);
    expect(current?.id).toBe(second.id);
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-denied`,
      lotType: "green",
      projectId: projectAId,
    });

    await expect(
      moveLotToStorage(wrongProjectUserAccountId, {
        lotId: lot.id,
        locationId: locationAId,
        startedAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });
});
