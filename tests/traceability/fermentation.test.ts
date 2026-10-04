/**
 * Phase 1, ticket T6 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §34). Real Postgres (Neon), no mocks. DoD: "Start→intervene→measure→end
 * cycle works, produces a stage-change LotTransformation."
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, TraceabilityAccessError } from "../../lib/traceability/lots";
import { computeCurrentQuantity, recordQuantityEvent } from "../../lib/traceability/quantity";
import { recordMeasurement } from "../../lib/traceability/measurements";
import { endFermentationRun, recordFermentationIntervention, startFermentationRun } from "../../lib/traceability/fermentation";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `t6-${Date.now()}`;

let organizationId: string;

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
  organizationId = await createTestOrganization(RUN_ID);
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
  const runs = await prisma.fermentationRun.findMany({ where: { transformations: { some: { inputs: { some: { lotId: { in: lotIds } } } } } } });
  const runIds = runs.map((r) => r.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "fermentation_run", entityId: { in: runIds } }) });
  await prisma.fermentationIntervention.deleteMany({ where: assertDefinedWhere({ fermentationRunId: { in: runIds } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ fermentationRunId: { in: runIds } }) });
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: runIds } }) });
  // Parte 1, R3: el proceso va antes que sus lotes (`lot_process.lot_id` es RESTRICT).
  await borrarProcesosDeLotesDonde({ id: { in: lotIds } });
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
  await deleteTestOrganizations(RUN_ID);
});

describe("Fermentation — full start/intervene/measure/end cycle", () => {
  // Longer than the 5s default — this test chains ~10 sequential real-DB
  // round trips (create/quantity/start/intervene/measure/end/asserts).
  it("runs the whole cycle and produces the expected stage-change transformations", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-cycle`,
      lotType: "processing",
      organizationId,
      projectId: projectAId,
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "received",
      quantity: 300,
      unit: "kg",
      occurredAt: new Date("2026-01-01"),
    });

    await abrirProcesoDePrueba(authorizedUserAccountId, lot.id);
    const { run, transformation: startTransformation } = await startFermentationRun(authorizedUserAccountId, {
      provenanceClass: "original_record",
      lotId: lot.id,
      vesselNote: "Tank 3",
      startedAt: new Date("2026-01-02"),
      inoculated: true,
      inoculationNote: "Wild ferment starter",
      quantity: 300,
      unit: "kg",
    });

    expect(run.endedAt).toBeNull();
    expect(startTransformation.transformationType).toBe("stage_change");
    expect(startTransformation.fermentationRunId).toBe(run.id);
    const startOutputs = await prisma.lotTransformationOutput.findMany({ where: { transformationId: startTransformation.id } });
    expect(startOutputs).toHaveLength(0);

    await recordFermentationIntervention(authorizedUserAccountId, {
      fermentationRunId: run.id,
      interventionType: "agitation",
      occurredAt: new Date("2026-01-02T12:00:00Z"),
      notes: "Midday stir",
    });

    const measurement = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      variable: "temperature",
      value: 24,
      unit: "C",
      occurredAt: new Date("2026-01-02T13:00:00Z"),
      lotId: lot.id,
    });
    expect(measurement.value.toNumber()).toBe(24);

    const { run: endedRun, transformation: endTransformation, outputLot } = await endFermentationRun(authorizedUserAccountId, {
      provenanceClass: "original_record",
      fermentationRunId: run.id,
      endedAt: new Date("2026-01-04"),
      outputLotCode: `${RUN_ID}-cycle-fermented`,
      outputLotType: "drying",
      quantity: 285,
      unit: "kg",
    });

    expect(endedRun.endedAt).toEqual(new Date("2026-01-04"));
    expect(endTransformation.fermentationRunId).toBe(run.id);
    expect(outputLot.lotType).toBe("drying");
    expect(outputLot.projectId).toBe(projectAId);

    const endInputs = await prisma.lotTransformationInput.findMany({ where: { transformationId: endTransformation.id } });
    expect(endInputs).toHaveLength(1);
    expect(endInputs[0]!.lotId).toBe(lot.id);

    // The new drying-stage lot's quantity is queryable immediately.
    const outputQuantity = await computeCurrentQuantity(authorizedUserAccountId, outputLot.id);
    expect(outputQuantity.quantity.toNumber()).toBe(285);

    const interventions = await prisma.fermentationIntervention.findMany({ where: { fermentationRunId: run.id } });
    expect(interventions).toHaveLength(1);

    const auditEvents = await prisma.auditEvent.findMany({
      where: { entityType: "fermentation_run", entityId: run.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(auditEvents.map((e) => e.operation)).toEqual(["fermentation_run.start", "fermentation_run.end"]);
    expect(auditEvents.every((e) => e.actorUserAccountId === authorizedUserAccountId)).toBe(true);
  }, 20000);

  it("denies a Farm Operator scoped to a different project from starting a run", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-start-denied`,
      lotType: "processing",
      organizationId,
      projectId: projectAId,
    });

    await expect(
      startFermentationRun(wrongProjectUserAccountId, {
        provenanceClass: "original_record",
        lotId: lot.id,
        startedAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("denies recording an intervention against a run in a different project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-intervention-denied`,
      lotType: "processing",
      organizationId,
      projectId: projectAId,
    });
    await abrirProcesoDePrueba(authorizedUserAccountId, lot.id);
    const { run } = await startFermentationRun(authorizedUserAccountId, {
      lotId: lot.id,
      startedAt: new Date(),
      provenanceClass: "original_record",
    });

    await expect(
      recordFermentationIntervention(wrongProjectUserAccountId, {
        fermentationRunId: run.id,
        interventionType: "sample",
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("rejects ending an already-ended run", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-double-end`,
      lotType: "processing",
      organizationId,
      projectId: projectAId,
    });
    await abrirProcesoDePrueba(authorizedUserAccountId, lot.id);
    const { run } = await startFermentationRun(authorizedUserAccountId, {
      lotId: lot.id,
      startedAt: new Date(),
      provenanceClass: "original_record",
    });

    await endFermentationRun(authorizedUserAccountId, {
      provenanceClass: "original_record",
      fermentationRunId: run.id,
      endedAt: new Date(),
      outputLotCode: `${RUN_ID}-double-end-output`,
      outputLotType: "drying",
    });

    await expect(
      endFermentationRun(authorizedUserAccountId, {
        provenanceClass: "original_record",
        fermentationRunId: run.id,
        endedAt: new Date(),
        outputLotCode: `${RUN_ID}-double-end-output-2`,
        outputLotType: "drying",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });
});
