/**
 * Phase 1, ticket T2 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §9, §34). Real Postgres (Neon), no mocks — same discipline as
 * tests/traceability/lots.test.ts. DoD: "Quantity computed correctly across
 * a multi-event lot history."
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, TraceabilityAccessError } from "../../lib/traceability/lots";
import { computeCurrentQuantity, QuantityValidationError, recordQuantityEvent } from "../../lib/traceability/quantity";

const RUN_ID = `t2-${Date.now()}`;

let projectAId: string;
let projectBId: string;

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
  const allTestLots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = allTestLots.map((l) => l.id);
  await prisma.quantityEvent.deleteMany({ where: { lotId: { in: lotIds } } });
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } });

  await prisma.assignment.deleteMany({
    where: { userAccountId: { in: [authorizedUserAccountId, wrongProjectUserAccountId] } },
  });
  await prisma.scope.deleteMany({ where: { OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }] } });
  await prisma.userAccount.deleteMany({
    where: { id: { in: [authorizedUserAccountId, wrongProjectUserAccountId] } },
  });
  await prisma.person.deleteMany({ where: { displayName: { contains: RUN_ID } } });
  await prisma.project.deleteMany({ where: { id: { in: [projectAId, projectBId] } } });
});

describe("recordQuantityEvent — RBAC and validation", () => {
  it("allows a project-scoped Farm Operator to record a quantity event on a lot in their project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-rbac-ok`,
      lotType: "cherry",
      projectId: projectAId,
    });
    const event = await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "received",
      quantity: 500,
      unit: "kg",
      occurredAt: new Date(),
    });
    expect(event.quantity.toNumber()).toBe(500);
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-rbac-cross-project`,
      lotType: "cherry",
      projectId: projectAId,
    });
    await expect(
      recordQuantityEvent(wrongProjectUserAccountId, {
        provenanceClass: "measured_fact",
        lotId: lot.id,
        eventType: "received",
        quantity: 100,
        unit: "kg",
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("rejects a negative quantity for every event type, including loss and adjustment_decrease", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-negative-rejection`,
      lotType: "cherry",
      projectId: projectAId,
    });
    await expect(
      recordQuantityEvent(authorizedUserAccountId, {
        provenanceClass: "measured_fact",
        lotId: lot.id,
        eventType: "loss",
        quantity: -5,
        unit: "kg",
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(QuantityValidationError);
    await expect(
      recordQuantityEvent(authorizedUserAccountId, {
        provenanceClass: "measured_fact",
        lotId: lot.id,
        eventType: "adjustment_decrease",
        quantity: -1,
        unit: "kg",
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(QuantityValidationError);
  });
});

describe("computeCurrentQuantity — sum computation across a multi-event lot history", () => {
  it("computes the running total across received, loss, and transfer events", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sum-basic`,
      lotType: "cherry",
      projectId: projectAId,
    });

    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "received",
      quantity: 500,
      unit: "kg",
      occurredAt: new Date("2026-01-01"),
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "loss",
      quantity: 20,
      unit: "kg",
      occurredAt: new Date("2026-01-02"),
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "sample_removed",
      quantity: 5,
      unit: "kg",
      occurredAt: new Date("2026-01-03"),
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "transfer_in",
      quantity: 25,
      unit: "kg",
      occurredAt: new Date("2026-01-04"),
    });

    // 500 - 20 - 5 + 25 = 500
    const result = await computeCurrentQuantity(authorizedUserAccountId, lot.id);
    expect(result.quantity.toNumber()).toBe(500);
    expect(result.unit).toBe("kg");
  });

  it("applies adjustment_increase and adjustment_decrease in their respective directions", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sum-adjustment`,
      lotType: "green",
      projectId: projectAId,
    });

    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "received",
      quantity: 100,
      unit: "kg",
      occurredAt: new Date("2026-01-01"),
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "adjustment_increase",
      quantity: 10,
      unit: "kg",
      occurredAt: new Date("2026-01-02"),
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "adjustment_decrease",
      quantity: 15,
      unit: "kg",
      occurredAt: new Date("2026-01-03"),
    });

    // 100 + 10 - 15 = 95
    const result = await computeCurrentQuantity(authorizedUserAccountId, lot.id);
    expect(result.quantity.toNumber()).toBe(95);
  });

  it("returns zero with no unit for a lot with no quantity events yet", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sum-empty`,
      lotType: "cherry",
      projectId: projectAId,
    });
    const result = await computeCurrentQuantity(authorizedUserAccountId, lot.id);
    expect(result.quantity.toNumber()).toBe(0);
    expect(result.unit).toBeNull();
  });

  it("throws if a lot's events carry more than one unit (no cross-unit conversion in Phase 1)", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sum-mixed-units`,
      lotType: "cherry",
      projectId: projectAId,
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "received",
      quantity: 500,
      unit: "kg",
      occurredAt: new Date("2026-01-01"),
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "received",
      quantity: 10,
      unit: "lb",
      occurredAt: new Date("2026-01-02"),
    });
    await expect(computeCurrentQuantity(authorizedUserAccountId, lot.id)).rejects.toThrow(QuantityValidationError);
  });

  it("denies computing quantity for a user with no access to the lot's project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sum-denied`,
      lotType: "cherry",
      projectId: projectAId,
    });
    await expect(computeCurrentQuantity(wrongProjectUserAccountId, lot.id)).rejects.toThrow(TraceabilityAccessError);
  });
});
