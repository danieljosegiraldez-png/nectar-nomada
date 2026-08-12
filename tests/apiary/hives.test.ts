/**
 * Ticket A1 (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md §3). Real
 * Postgres (Neon), no mocks — same discipline as every Traceability test
 * suite. DoD (A1 row): Location.locationType gains apiary_site, Hive/Colony
 * schema, apiary RBAC subject, service layer — no origin fields, no
 * Inspection, no ColonyEvent (those are A2).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { ApiaryAccessError, createColony, createHive, getHive } from "../../lib/apiary/hives";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a1-${Date.now()}`;

let organizationId: string;
let projectAId: string;
let projectBId: string;
let apiarySiteId: string; // locationType = apiary_site, no projectId — location-scoped access only
let otherApiarySiteId: string;

let authorizedUserAccountId: string; // Farm Operator, scope: project A
let locationScopedUserAccountId: string; // Farm Operator, scope: apiarySiteId
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

  const apiarySite = await prisma.location.create({
    data: { locationType: "apiary_site", name: `TEST Apiary (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  apiarySiteId = apiarySite.id;

  const otherApiarySite = await prisma.location.create({
    data: { locationType: "apiary_site", name: `TEST Other Apiary (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  otherApiarySiteId = otherApiarySite.id;

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

  locationScopedUserAccountId = await createTestUserAccount("LocationScopedOperator");
  await assignFarmOperator(locationScopedUserAccountId, { scopeType: "location", scopeRefId: apiarySiteId });

  wrongProjectUserAccountId = await createTestUserAccount("WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, { scopeType: "project", scopeRefId: projectBId });

  unauthorizedUserAccountId = await createTestUserAccount("Unauthorized");
});

afterAll(async () => {
  const testHives = await prisma.hive.findMany({ where: { identifier: { startsWith: RUN_ID } } });
  const hiveIds = testHives.map((h) => h.id);
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ hiveId: { in: hiveIds } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: hiveIds } }) });

  const userAccountIds = [authorizedUserAccountId, locationScopedUserAccountId, wrongProjectUserAccountId, unauthorizedUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({
    where: assertDefinedWhere({ OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }, { scopeRefId: apiarySiteId }] }),
  });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [apiarySiteId, otherApiarySiteId] } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectAId, projectBId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("Location.locationType — apiary_site", () => {
  it("was created successfully by beforeAll, round-tripping the new enum value", async () => {
    const reloaded = await prisma.location.findUniqueOrThrow({ where: { id: apiarySiteId } });
    expect(reloaded.locationType).toBe("apiary_site");
  });
});

describe("createHive", () => {
  it("creates a Hive for a project-scoped Farm Operator, status defaulting to active", async () => {
    const hive = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-001`,
      locationId: apiarySiteId,
      projectId: projectAId,
    });

    expect(hive.identifier).toBe(`${RUN_ID}-H-001`);
    expect(hive.locationId).toBe(apiarySiteId);
    expect(hive.status).toBe("active");
    expect(hive.installedAt).toBeNull();
  });

  it("creates a Hive for a Farm Operator scoped to the apiary_site Location directly, with no projectId at all", async () => {
    const hive = await createHive(locationScopedUserAccountId, {
      identifier: `${RUN_ID}-H-002`,
      locationId: apiarySiteId,
    });

    expect(hive.projectId).toBeNull();
    expect(hive.locationId).toBe(apiarySiteId);
  });

  it("denies a Farm Operator scoped to a different project and a different location", async () => {
    await expect(
      createHive(wrongProjectUserAccountId, { identifier: `${RUN_ID}-H-003`, locationId: apiarySiteId }),
    ).rejects.toThrow(ApiaryAccessError);
  });

  it("denies a user with no Assignment at all", async () => {
    await expect(
      createHive(unauthorizedUserAccountId, { identifier: `${RUN_ID}-H-004`, locationId: apiarySiteId, projectId: projectAId }),
    ).rejects.toThrow(ApiaryAccessError);
  });
});

describe("createColony", () => {
  it("creates a Colony under an existing Hive, provenanceClass persisted verbatim, dataQuality null by default", async () => {
    const hive = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-005`,
      locationId: apiarySiteId,
      projectId: projectAId,
    });

    const colony = await createColony(authorizedUserAccountId, {
      hiveId: hive.id,
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });

    expect(colony.hiveId).toBe(hive.id);
    expect(colony.status).toBe("active");
    expect(colony.provenanceClass).toBe("direct_observation");
    expect(colony.dataQuality).toBeNull();
  });

  it("resolves RBAC via the parent Hive's own scope, not an independent one — denies a wrong-project operator", async () => {
    const hive = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-006`,
      locationId: apiarySiteId,
      projectId: projectAId,
    });

    await expect(
      createColony(wrongProjectUserAccountId, {
        hiveId: hive.id,
        startedAt: new Date("2026-01-01"),
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(ApiaryAccessError);
  });

  it("rejects an unknown hiveId", async () => {
    await expect(
      createColony(authorizedUserAccountId, {
        hiveId: "00000000-0000-0000-0000-000000000000",
        startedAt: new Date("2026-01-01"),
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(ApiaryAccessError);
  });
});

describe("getHive", () => {
  it("returns the Hive with its Colonies included, for an authorized viewer", async () => {
    const hive = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-007`,
      locationId: apiarySiteId,
      projectId: projectAId,
    });
    await createColony(authorizedUserAccountId, {
      hiveId: hive.id,
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });

    const reloaded = await getHive(authorizedUserAccountId, hive.id);
    expect(reloaded.colonies).toHaveLength(1);
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    const hive = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-008`,
      locationId: apiarySiteId,
      projectId: projectAId,
    });

    await expect(getHive(wrongProjectUserAccountId, hive.id)).rejects.toThrow(ApiaryAccessError);
  });
});
