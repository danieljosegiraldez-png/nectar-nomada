/**
 * Phase 1, ticket T3 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §34). Real Postgres (Neon), no mocks — same discipline as
 * tests/traceability/lots.test.ts and quantity.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, TraceabilityAccessError } from "../../lib/traceability/lots";
import { correctMeasurement, MeasurementValidationError, recordMeasurement } from "../../lib/traceability/measurements";
import { UnitValidationError } from "../../lib/traceability/units";

const RUN_ID = `t3-${Date.now()}`;

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
  await prisma.measurement.deleteMany({ where: { lotId: { in: lotIds } } });
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

describe("recordMeasurement — RBAC, validation, unit conversion", () => {
  it("allows a project-scoped Farm Operator to record a measurement on a lot in their project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-rbac-ok`,
      lotType: "cherry",
      projectId: projectAId,
    });
    const measurement = await recordMeasurement(authorizedUserAccountId, {
      variable: "brix",
      value: 22,
      unit: "Bx",
      occurredAt: new Date(),
      lotId: lot.id,
    });
    expect(measurement.value.toNumber()).toBe(22);
    expect(measurement.unit).toBe("Bx");
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-rbac-cross-project`,
      lotType: "cherry",
      projectId: projectAId,
    });
    await expect(
      recordMeasurement(wrongProjectUserAccountId, {
        variable: "brix",
        value: 22,
        unit: "Bx",
        occurredAt: new Date(),
        lotId: lot.id,
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("requires at least one subject (lotId or sampleId)", async () => {
    await expect(
      recordMeasurement(authorizedUserAccountId, {
        variable: "brix",
        value: 22,
        unit: "Bx",
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(MeasurementValidationError);
  });

  it("normalizes a Fahrenheit temperature entry to the canonical Celsius value before storing", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-fahrenheit`,
      lotType: "processing",
      projectId: projectAId,
    });
    const measurement = await recordMeasurement(authorizedUserAccountId, {
      variable: "temperature",
      value: 98.6,
      unit: "F",
      occurredAt: new Date(),
      lotId: lot.id,
    });
    expect(measurement.unit).toBe("C");
    expect(measurement.value.toNumber()).toBeCloseTo(37, 5);
  });

  it("rejects an out-of-range value via the unit registry", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-out-of-range`,
      lotType: "processing",
      projectId: projectAId,
    });
    await expect(
      recordMeasurement(authorizedUserAccountId, {
        variable: "ph",
        value: 20,
        unit: "pH",
        occurredAt: new Date(),
        lotId: lot.id,
      }),
    ).rejects.toThrow(UnitValidationError);
  });
});

describe("correctMeasurement — append-only correction chain", () => {
  it("writes a new row pointing at the original via correctsId, leaving the original untouched", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-correction`,
      lotType: "drying",
      projectId: projectAId,
    });
    const original = await recordMeasurement(authorizedUserAccountId, {
      variable: "moisture",
      value: 12,
      unit: "%",
      occurredAt: new Date("2026-01-01"),
      lotId: lot.id,
    });

    const correction = await correctMeasurement(authorizedUserAccountId, {
      measurementId: original.id,
      value: 11.5,
      unit: "%",
      occurredAt: new Date("2026-01-01T01:00:00Z"),
      reason: "Scale was not tared before the original reading.",
    });

    expect(correction.correctsId).toBe(original.id);
    expect(correction.value.toNumber()).toBe(11.5);

    const originalReloaded = await prisma.measurement.findUniqueOrThrow({ where: { id: original.id } });
    expect(originalReloaded.value.toNumber()).toBe(12);
    expect(originalReloaded.correctsId).toBeNull();
  });

  it("requires a non-empty reason", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-correction-no-reason`,
      lotType: "drying",
      projectId: projectAId,
    });
    const original = await recordMeasurement(authorizedUserAccountId, {
      variable: "moisture",
      value: 12,
      unit: "%",
      occurredAt: new Date(),
      lotId: lot.id,
    });

    await expect(
      correctMeasurement(authorizedUserAccountId, {
        measurementId: original.id,
        value: 11.5,
        unit: "%",
        occurredAt: new Date(),
        reason: "   ",
      }),
    ).rejects.toThrow(MeasurementValidationError);
  });
});
