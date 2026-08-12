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
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

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
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });

  await prisma.assignment.deleteMany({
    where: assertDefinedWhere({ userAccountId: { in: [authorizedUserAccountId, wrongProjectUserAccountId] } }),
  });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }] }) });
  await prisma.userAccount.deleteMany({
    where: assertDefinedWhere({ id: { in: [authorizedUserAccountId, wrongProjectUserAccountId] } }),
  });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectAId, projectBId] } }) });
});

describe("recordMeasurement — RBAC, validation, unit conversion", () => {
  it("allows a project-scoped Farm Operator to record a measurement on a lot in their project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-rbac-ok`,
      lotType: "cherry",
      projectId: projectAId,
    });
    const measurement = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
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
        provenanceClass: "measured_fact",
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
        provenanceClass: "measured_fact",
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
      provenanceClass: "measured_fact",
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
        provenanceClass: "measured_fact",
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
      provenanceClass: "measured_fact",
      variable: "moisture",
      value: 12,
      unit: "%",
      occurredAt: new Date("2026-01-01"),
      lotId: lot.id,
    });

    const correction = await correctMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
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
      provenanceClass: "measured_fact",
      variable: "moisture",
      value: 12,
      unit: "%",
      occurredAt: new Date(),
      lotId: lot.id,
    });

    await expect(
      correctMeasurement(authorizedUserAccountId, {
        provenanceClass: "measured_fact",
        measurementId: original.id,
        value: 11.5,
        unit: "%",
        occurredAt: new Date(),
        reason: "   ",
      }),
    ).rejects.toThrow(MeasurementValidationError);
  });
});

// T9.5 — the retrofit's two required tests: no silent direct_observation,
// and operatorPersonId genuinely independent of createdBy.
describe("T9.5 — provenance is chosen, never defaulted; observer independent of creator", () => {
  it("persists exactly the provenanceClass the caller chose, never a silent direct_observation", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-provenance-explicit`,
      lotType: "processing",
      projectId: projectAId,
    });

    const labResult = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "scientific_evidence",
      variable: "ph",
      value: 4.2,
      unit: "pH",
      occurredAt: new Date(),
      lotId: lot.id,
    });
    expect(labResult.provenanceClass).toBe("scientific_evidence");

    const estimate = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "interpretation",
      variable: "moisture",
      value: 11,
      unit: "%",
      occurredAt: new Date(),
      lotId: lot.id,
    });
    expect(estimate.provenanceClass).toBe("interpretation");
    // Neither call named "direct_observation" and neither row landed there —
    // T1-T9's silent `?? "direct_observation"` fallback is gone; there is no
    // longer a code path that can produce that value except a caller asking
    // for it by name.
    expect(labResult.provenanceClass).not.toBe("direct_observation");
    expect(estimate.provenanceClass).not.toBe("direct_observation");
  });

  it("allows operatorPersonId (who observed) to differ from createdBy (who typed it in)", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-observer-divergence`,
      lotType: "drying",
      projectId: projectAId,
    });

    // The field technician who actually took the reading at the drying
    // beds — a real Person, deliberately with no UserAccount of their own,
    // since this scenario is exactly "someone who isn't logged into the
    // platform did the observing."
    const fieldTechnician = await prisma.person.create({
      data: { givenName: "TEST", familyName: "FieldTechnician", displayName: `TEST FieldTechnician (${RUN_ID})`, locale: "es" },
    });

    const measurement = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      variable: "moisture",
      value: 10.5,
      unit: "%",
      occurredAt: new Date(),
      lotId: lot.id,
      operatorPersonId: fieldTechnician.id,
    });

    const recordingUserAccount = await prisma.userAccount.findUniqueOrThrow({ where: { id: authorizedUserAccountId } });

    expect(measurement.operatorPersonId).toBe(fieldTechnician.id);
    expect(measurement.createdBy).toBe(authorizedUserAccountId);
    // The case T9.5 exists to make reachable: the person who observed and
    // the account that recorded it are two different people on one row.
    expect(measurement.operatorPersonId).not.toBe(recordingUserAccount.personId);
  });
});
