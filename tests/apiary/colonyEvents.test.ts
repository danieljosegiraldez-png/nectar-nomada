/**
 * Ticket A2 — REVISED (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md
 * §1a, §3). Real Postgres (Neon), no mocks. feeding/treatment/
 * passing_observation share one type-discriminated table, separate from
 * Inspection.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { ApiaryAccessError, createColony, createHive } from "../../lib/apiary/hives";
import { ColonyEventValidationError, recordColonyEvent, listColonyEventsForColony } from "../../lib/apiary/colonyEvents";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a2-cevt-${Date.now()}`;

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
    originType: "captured",
    provenanceClass: "direct_observation",
  });
  colonyId = colony.id;
});

afterAll(async () => {
  await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: colonyId }) });
  const testHives = await prisma.hive.findMany({ where: { identifier: { startsWith: RUN_ID } } });
  // La colocación es hija de la colmena y su FK es RESTRICT: sin esta línea el borrado
  // de abajo falla. `createHive` abre una desde el 2026-09-15 (ADR-135).
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { id: { in: testHives.map((h) => h.id) } } }) });
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

describe("recordColonyEvent — feeding", () => {
  it("records a feeding, provenanceClass fixed to original_record (an action taken)", async () => {
    const event = await recordColonyEvent(authorizedUserAccountId, {
      colonyId,
      eventType: "feeding",
      feedingMaterial: "sugar syrup 1:1",
      feedingQuantity: 2,
      feedingUnit: "L",
    });

    expect(event.eventType).toBe("feeding");
    expect(event.provenanceClass).toBe("original_record");
    expect(event.feedingMaterial).toBe("sugar syrup 1:1");
    expect(event.treatmentBatchLabel).toBeNull();
  });
});

describe("recordColonyEvent — treatment", () => {
  it("requires treatmentBatchLabel — rejects a treatment event without one", async () => {
    await expect(
      recordColonyEvent(authorizedUserAccountId, {
        colonyId,
        eventType: "treatment",
        treatmentTarget: "varroa",
        treatmentProduct: "Apivar",
      }),
    ).rejects.toThrow(ColonyEventValidationError);
  });

  it("rejects a whitespace-only treatmentBatchLabel the same as a missing one", async () => {
    await expect(
      recordColonyEvent(authorizedUserAccountId, {
        colonyId,
        eventType: "treatment",
        treatmentTarget: "varroa",
        treatmentProduct: "Apivar",
        treatmentBatchLabel: "   ",
        treatmentWithdrawalDays: 14,
      }),
    ).rejects.toThrow(ColonyEventValidationError);
  });

  it("records a treatment with treatmentBatchLabel present, provenanceClass fixed to original_record", async () => {
    const event = await recordColonyEvent(authorizedUserAccountId, {
      colonyId,
      eventType: "treatment",
      treatmentTarget: "varroa",
      treatmentProduct: "Apivar",
      treatmentBatchLabel: "APV-2026-014",
      treatmentWithdrawalDays: 14,
      treatmentDose: 2,
      treatmentDoseUnit: "strips",
    });

    expect(event.eventType).toBe("treatment");
    expect(event.provenanceClass).toBe("original_record");
    expect(event.treatmentBatchLabel).toBe("APV-2026-014");
  });

  it("the validation guard runs before the RBAC/DB check — an unauthorized user is still rejected for the batch label, not silently authorized first", async () => {
    // Mirrors recordMaterialConsumptionEntry's own ordering (T12.6):
    // input validation is cheap and runs first, regardless of caller.
    await expect(
      recordColonyEvent(unauthorizedUserAccountId, { colonyId, eventType: "treatment" }),
    ).rejects.toThrow(ColonyEventValidationError);
  });
});

describe("recordColonyEvent — passing_observation", () => {
  it("records a passing observation, provenanceClass fixed to direct_observation (a state fact, witnessed)", async () => {
    const event = await recordColonyEvent(authorizedUserAccountId, {
      colonyId,
      eventType: "passing_observation",
      note: "Dead-out noticed from outside, not opened",
    });

    expect(event.eventType).toBe("passing_observation");
    expect(event.provenanceClass).toBe("direct_observation");
    expect(event.note).toBe("Dead-out noticed from outside, not opened");
  });
});

describe("recordColonyEvent — RBAC", () => {
  it("denies a Farm Operator scoped to a different project", async () => {
    await expect(
      recordColonyEvent(wrongProjectUserAccountId, { colonyId, eventType: "feeding", feedingMaterial: "sugar syrup" }),
    ).rejects.toThrow(ApiaryAccessError);
  });

  it("rejects an unknown colonyId", async () => {
    await expect(
      recordColonyEvent(authorizedUserAccountId, {
        colonyId: "00000000-0000-0000-0000-000000000000",
        eventType: "feeding",
      }),
    ).rejects.toThrow(ApiaryAccessError);
  });
});

describe("listColonyEventsForColony", () => {
  it("returns recorded events, most recent first", async () => {
    await recordColonyEvent(authorizedUserAccountId, {
      colonyId,
      eventType: "passing_observation",
      note: "first",
      occurredAt: new Date("2026-03-01"),
    });
    await recordColonyEvent(authorizedUserAccountId, {
      colonyId,
      eventType: "passing_observation",
      note: "second",
      occurredAt: new Date("2026-03-10"),
    });

    const rows = await listColonyEventsForColony(authorizedUserAccountId, colonyId);
    const [first, second] = rows;
    if (!first || !second) throw new Error("expected at least two rows");
    expect(first.occurredAt.getTime()).toBeGreaterThanOrEqual(second.occurredAt.getTime());
  });
});

// A5/A0 (25_OFFLINE_OPTIONS_ANALYSIS.md §0) — same idempotent-sync
// guarantee as Inspection's own clientDraftId test.
describe("recordColonyEvent — clientDraftId idempotency", () => {
  it("a retried call with the same clientDraftId returns the existing row, not a duplicate", async () => {
    const clientDraftId = `${RUN_ID}-draft-1`;

    const first = await recordColonyEvent(authorizedUserAccountId, {
      colonyId,
      eventType: "passing_observation",
      note: "retried",
      clientDraftId,
    });
    const retried = await recordColonyEvent(authorizedUserAccountId, {
      colonyId,
      eventType: "passing_observation",
      note: "retried",
      clientDraftId,
    });

    expect(retried.id).toBe(first.id);
    const rows = await prisma.colonyEvent.findMany({ where: { clientDraftId } });
    expect(rows).toHaveLength(1);
  });

  it("the treatmentBatchLabel validation still runs before the idempotency check on a retry", async () => {
    // A retried sync of a draft that was never valid to begin with must
    // still fail every time, not silently "succeed" the second time
    // because a lookup short-circuited past validation.
    await expect(
      recordColonyEvent(authorizedUserAccountId, {
        colonyId,
        eventType: "treatment",
        treatmentTarget: "varroa",
        clientDraftId: `${RUN_ID}-draft-invalid`,
      }),
    ).rejects.toThrow(ColonyEventValidationError);
  });
});
