/**
 * Ticket A2 — REVISED (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md
 * §1a, §3). Real Postgres (Neon), no mocks. Inspection stays formal and
 * structurally protected — no `feeding`/`treatment` value exists anywhere
 * on this table.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { ApiaryAccessError, createColony, createHive } from "../../lib/apiary/hives";
import { listInspectionsForColony, recordInspection } from "../../lib/apiary/inspections";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a2-insp-${Date.now()}`;

let organizationId: string;
let projectAId: string;
let projectBId: string;
let apiarySiteId: string;
let colonyId: string;

let authorizedUserAccountId: string; // Farm Operator, scope: project A
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

  const apiarySite = await prisma.location.create({
    data: { locationType: "apiary_site", name: `TEST Apiary (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  apiarySiteId = apiarySite.id;

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

  unauthorizedUserAccountId = await createTestUserAccount("Unauthorized");

  const hive = await createHive(authorizedUserAccountId, {
    identifier: `${RUN_ID}-H-001`,
    locationId: apiarySiteId,
    projectId: projectAId,
  });
  const colony = await createColony(authorizedUserAccountId, {
    hiveId: hive.id,
    startedAt: new Date("2026-01-01"),
    originType: "purchased",
    provenanceClass: "direct_observation",
  });
  colonyId = colony.id;
});

afterAll(async () => {
  await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: colonyId }) });
  const testHives = await prisma.hive.findMany({ where: { identifier: { startsWith: RUN_ID } } });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: testHives.map((h) => h.id) } }) });

  const userAccountIds = [authorizedUserAccountId, wrongProjectUserAccountId, unauthorizedUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }] }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: apiarySiteId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectAId, projectBId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("recordInspection", () => {
  it("records the one-tap routine case — outcome nothing_unusual, every optional field null", async () => {
    const inspection = await recordInspection(authorizedUserAccountId, {
      colonyId,
      outcome: "nothing_unusual",
    });

    expect(inspection.outcome).toBe("nothing_unusual");
    expect(inspection.broodPatternNote).toBeNull();
    expect(inspection.queenSighted).toBeNull();
  });

  it("records the expanded-details case — outcome issue_observed with optional fields populated", async () => {
    const inspection = await recordInspection(authorizedUserAccountId, {
      colonyId,
      outcome: "issue_observed",
      broodPatternNote: "Spotty pattern, several empty cells",
      queenSighted: false,
      storesLevel: "low",
      pestDiseaseFlags: "possible varroa",
    });

    expect(inspection.outcome).toBe("issue_observed");
    expect(inspection.broodPatternNote).toBe("Spotty pattern, several empty cells");
    expect(inspection.queenSighted).toBe(false);
  });

  it("fixes provenanceClass to direct_observation at the action layer, not caller-supplied", async () => {
    const inspection = await recordInspection(authorizedUserAccountId, { colonyId, outcome: "nothing_unusual" });
    expect(inspection.provenanceClass).toBe("direct_observation");
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    await expect(recordInspection(wrongProjectUserAccountId, { colonyId, outcome: "nothing_unusual" })).rejects.toThrow(
      ApiaryAccessError,
    );
  });

  it("denies a user with no Assignment at all", async () => {
    await expect(recordInspection(unauthorizedUserAccountId, { colonyId, outcome: "nothing_unusual" })).rejects.toThrow(
      ApiaryAccessError,
    );
  });

  it("rejects an unknown colonyId", async () => {
    await expect(
      recordInspection(authorizedUserAccountId, { colonyId: "00000000-0000-0000-0000-000000000000", outcome: "nothing_unusual" }),
    ).rejects.toThrow(ApiaryAccessError);
  });
});

describe("listInspectionsForColony", () => {
  it("returns recorded inspections, most recent first", async () => {
    await recordInspection(authorizedUserAccountId, { colonyId, outcome: "nothing_unusual", occurredAt: new Date("2026-02-01") });
    await recordInspection(authorizedUserAccountId, { colonyId, outcome: "issue_observed", occurredAt: new Date("2026-02-10") });

    const rows = await listInspectionsForColony(authorizedUserAccountId, colonyId);
    const [first, second] = rows;
    if (!first || !second) throw new Error("expected at least two rows");
    expect(first.occurredAt.getTime()).toBeGreaterThanOrEqual(second.occurredAt.getTime());
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    await expect(listInspectionsForColony(wrongProjectUserAccountId, colonyId)).rejects.toThrow(ApiaryAccessError);
  });
});

// A5/A0 (25_OFFLINE_OPTIONS_ANALYSIS.md §0) — a retried offline-sync pass
// must be a no-op, not a duplicate row, checked server-side before insert.
describe("recordInspection — clientDraftId idempotency", () => {
  it("a retried call with the same clientDraftId returns the existing row, not a duplicate", async () => {
    const clientDraftId = `${RUN_ID}-draft-1`;

    const first = await recordInspection(authorizedUserAccountId, { colonyId, outcome: "nothing_unusual", clientDraftId });
    const retried = await recordInspection(authorizedUserAccountId, { colonyId, outcome: "nothing_unusual", clientDraftId });

    expect(retried.id).toBe(first.id);
    const rows = await prisma.inspection.findMany({ where: { clientDraftId } });
    expect(rows).toHaveLength(1);
  });

  it("two different clientDraftIds produce two distinct rows", async () => {
    const first = await recordInspection(authorizedUserAccountId, {
      colonyId,
      outcome: "nothing_unusual",
      clientDraftId: `${RUN_ID}-draft-2a`,
    });
    const second = await recordInspection(authorizedUserAccountId, {
      colonyId,
      outcome: "nothing_unusual",
      clientDraftId: `${RUN_ID}-draft-2b`,
    });

    expect(first.id).not.toBe(second.id);
  });
});
