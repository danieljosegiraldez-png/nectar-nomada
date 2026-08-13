/**
 * Phase 1, ticket T7 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §34). Real Postgres (Neon), no mocks — same pattern as
 * fermentation.test.ts (T6). DoD: same shape as T6, drying-specific fields.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, TraceabilityAccessError } from "../../lib/traceability/lots";
import { computeCurrentQuantity, recordQuantityEvent } from "../../lib/traceability/quantity";
import { endDryingRun, recordDryingTurnEvent, startDryingRun } from "../../lib/traceability/drying";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `t7-${Date.now()}`;

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
  const testLots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = testLots.map((l) => l.id);

  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  const runs = await prisma.dryingRun.findMany({ where: { transformations: { some: { inputs: { some: { lotId: { in: lotIds } } } } } } });
  const runIds = runs.map((r) => r.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "drying_run", entityId: { in: runIds } }) });
  await prisma.dryingTurnEvent.deleteMany({ where: assertDefinedWhere({ dryingRunId: { in: runIds } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ dryingRunId: { in: runIds } }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: runIds } }) });
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

describe("Drying — full start/turn/measure/end cycle", () => {
  // Longer than the 5s default — this test chains many sequential real-DB
  // round trips, same as T6's equivalent cycle test.
  it("runs the whole cycle and produces the expected stage-change transformations", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-cycle`,
      lotType: "drying",
      projectId: projectAId,
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "received",
      quantity: 285,
      unit: "kg",
      occurredAt: new Date("2026-01-04"),
    });

    const { run, transformation: startTransformation } = await startDryingRun(authorizedUserAccountId, {
      provenanceClass: "original_record",
      lotId: lot.id,
      method: "raised_bed",
      layerDepthCm: 5,
      startedAt: new Date("2026-01-04T01:00:00Z"),
      quantity: 285,
      unit: "kg",
    });

    expect(run.endedAt).toBeNull();
    expect(startTransformation.dryingRunId).toBe(run.id);
    const startOutputs = await prisma.lotTransformationOutput.findMany({ where: { transformationId: startTransformation.id } });
    expect(startOutputs).toHaveLength(0);

    await recordDryingTurnEvent(authorizedUserAccountId, {
      dryingRunId: run.id,
      eventType: "turned",
      occurredAt: new Date("2026-01-05"),
      notes: "Morning turn",
    });

    const { run: endedRun, transformation: endTransformation, outputLot } = await endDryingRun(authorizedUserAccountId, {
      provenanceClass: "original_record",
      dryingRunId: run.id,
      endedAt: new Date("2026-01-15"),
      outputLotCode: `${RUN_ID}-cycle-green`,
      outputLotType: "green",
      quantity: 75,
      unit: "kg",
    });

    expect(endedRun.endedAt).toEqual(new Date("2026-01-15"));
    expect(endTransformation.dryingRunId).toBe(run.id);
    expect(outputLot.lotType).toBe("green");

    const endInputs = await prisma.lotTransformationInput.findMany({ where: { transformationId: endTransformation.id } });
    expect(endInputs).toHaveLength(1);
    expect(endInputs[0]!.lotId).toBe(lot.id);

    const outputQuantity = await computeCurrentQuantity(authorizedUserAccountId, outputLot.id);
    expect(outputQuantity.quantity.toNumber()).toBe(75);

    const turnEvents = await prisma.dryingTurnEvent.findMany({ where: { dryingRunId: run.id } });
    expect(turnEvents).toHaveLength(1);

    const auditEvents = await prisma.auditEvent.findMany({
      where: { entityType: "drying_run", entityId: run.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(auditEvents.map((e) => e.operation)).toEqual(["drying_run.start", "drying_run.end"]);
    expect(auditEvents.every((e) => e.actorUserAccountId === authorizedUserAccountId)).toBe(true);
  }, 20000);

  it("denies a Farm Operator scoped to a different project from starting a run", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-start-denied`,
      lotType: "drying",
      projectId: projectAId,
    });

    await expect(
      startDryingRun(wrongProjectUserAccountId, {
        provenanceClass: "original_record",
        lotId: lot.id,
        startedAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("denies recording a turn event against a run in a different project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-turn-denied`,
      lotType: "drying",
      projectId: projectAId,
    });
    const { run } = await startDryingRun(authorizedUserAccountId, {
      lotId: lot.id,
      startedAt: new Date(),
      provenanceClass: "original_record",
    });

    await expect(
      recordDryingTurnEvent(wrongProjectUserAccountId, {
        dryingRunId: run.id,
        eventType: "covered",
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("rejects ending an already-ended run", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-double-end`,
      lotType: "drying",
      projectId: projectAId,
    });
    const { run } = await startDryingRun(authorizedUserAccountId, {
      lotId: lot.id,
      startedAt: new Date(),
      provenanceClass: "original_record",
    });

    await endDryingRun(authorizedUserAccountId, {
      provenanceClass: "original_record",
      dryingRunId: run.id,
      endedAt: new Date(),
      outputLotCode: `${RUN_ID}-double-end-output`,
      outputLotType: "green",
    });

    await expect(
      endDryingRun(authorizedUserAccountId, {
        provenanceClass: "original_record",
        dryingRunId: run.id,
        endedAt: new Date(),
        outputLotCode: `${RUN_ID}-double-end-output-2`,
        outputLotType: "green",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });
});
