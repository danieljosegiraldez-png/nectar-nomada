/**
 * Phase 1, ticket T5 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §34). Real Postgres (Neon), no mocks — same discipline as the other
 * tests/traceability/*.test.ts files. DoD: "Sample correctly links back to
 * its source Lot."
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, TraceabilityAccessError } from "../../lib/traceability/lots";
import { computeCurrentQuantity, recordQuantityEvent } from "../../lib/traceability/quantity";
import { createSampleFromLot, SampleValidationError } from "../../lib/traceability/samples";
import { startDryingRun, endDryingRun } from "../../lib/traceability/drying";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `t5-${Date.now()}`;

let organizationId: string;

let projectAId: string;
let projectBId: string;

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

  unauthorizedUserAccountId = await createTestUserAccount("Unauthorized");
});

afterAll(async () => {
  const testLots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = testLots.map((l) => l.id);

  const transformacionesConSecado = await prisma.lotTransformation.findMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] }),
    select: { dryingRunId: true },
  });
  const dryingRunIds = [...new Set(transformacionesConSecado.map((t) => t.dryingRunId).filter((id): id is string => id != null))];

  await prisma.sample.deleteMany({ where: assertDefinedWhere({ sampleCode: { startsWith: RUN_ID } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] }),
  });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: dryingRunIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });

  await prisma.assignment.deleteMany({
    where: assertDefinedWhere({ userAccountId: { in: [authorizedUserAccountId, wrongProjectUserAccountId] } }),
  });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }] }) });
  await prisma.userAccount.deleteMany({
    where: assertDefinedWhere({ id: { in: [authorizedUserAccountId, wrongProjectUserAccountId, unauthorizedUserAccountId] } }),
  });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectAId, projectBId] } }) });
  await deleteTestOrganizations(RUN_ID);
});

describe("createSampleFromLot — lineage, RBAC, quantity accounting", () => {
  it("creates a Sample linked back to its source Lot via a sample_extraction transformation", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sample-ok`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });

    const { transformation, sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S001`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      quantity: 1.5,
      unit: "kg",
      occurredAt: new Date(),
    });

    expect(transformation.transformationType).toBe("sample_extraction");
    expect(sample.sourceLotId).toBe(lot.id);
    expect(sample.sourceTransformationId).toBe(transformation.id);
    // Same project/organization/location context as its source lot.
    expect(sample.projectId).toBe(projectAId);

    // The transformation's "output" is the Sample, not a second Lot row.
    const outputs = await prisma.lotTransformationOutput.findMany({ where: { transformationId: transformation.id } });
    expect(outputs).toHaveLength(0);
    const inputs = await prisma.lotTransformationInput.findMany({ where: { transformationId: transformation.id } });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.lotId).toBe(lot.id);
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sample-denied`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });

    await expect(
      createSampleFromLot(wrongProjectUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S002`,
        sampleType: "green_coffee",
        sourceLotId: lot.id,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("denies a user with no Assignment at all (T9 RBAC negative case, §31 — sample:manage's own version of T1's lot:manage test)", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sample-unauthorized`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });

    await expect(
      createSampleFromLot(unauthorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S006`,
        sampleType: "green_coffee",
        sourceLotId: lot.id,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("rejects an unknown source lot", async () => {
    await expect(
      createSampleFromLot(authorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S003`,
        sampleType: "green_coffee",
        sourceLotId: "00000000-0000-0000-0000-000000000000",
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("reduces the source lot's current quantity by the sample amount extracted", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sample-quantity`,
      lotType: "green",
      organizationId,
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

    await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S004`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      quantity: 1.5,
      unit: "kg",
      occurredAt: new Date("2026-01-02"),
    });

    const quantity = await computeCurrentQuantity(authorizedUserAccountId, lot.id);
    expect(quantity.quantity.toNumber()).toBe(98.5);

    const sampleRemovedEvents = await prisma.quantityEvent.findMany({
      where: { lotId: lot.id, eventType: "sample_removed" },
    });
    expect(sampleRemovedEvents).toHaveLength(1);
  });

  it("creates no QuantityEvent when no quantity is given for the sample (missing stays missing)", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sample-no-quantity`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });

    await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S005`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });

    const events = await prisma.quantityEvent.findMany({ where: { lotId: lot.id } });
    expect(events).toHaveLength(0);
  });
});

describe("createSampleFromLot — la muestra verde exige almacenamiento (2026-09-18)", () => {
  it("rechaza una muestra verde si el lote nunca terminó de secar", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-verde-sin-secar`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });

    await expect(
      createSampleFromLot(authorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S-verde-1`,
        sampleType: "green_coffee",
        materialState: "GREEN",
        sourceLotId: lot.id,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(SampleValidationError);
  });

  it("rechaza una muestra verde si el secado está en curso", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-verde-secando`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
    });
    await startDryingRun(authorizedUserAccountId, {
      lotId: lot.id,
      startedAt: new Date(),
      provenanceClass: "original_record",
    });

    await expect(
      createSampleFromLot(authorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S-verde-2`,
        sampleType: "green_coffee",
        materialState: "GREEN",
        sourceLotId: lot.id,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(SampleValidationError);
  });

  it("acepta una muestra verde cuando el secado terminó con humedad objetivo", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-verde-reposo`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
    });
    const { run } = await startDryingRun(authorizedUserAccountId, {
      lotId: lot.id,
      startedAt: new Date(Date.now() - 86_400_000),
      provenanceClass: "original_record",
    });
    await endDryingRun(authorizedUserAccountId, {
      dryingRunId: run.id,
      endedAt: new Date(),
      endedOutcome: "target_reached",
      outputLotCode: `${RUN_ID}-verde-reposo-salida`,
      outputLotType: "green",
      provenanceClass: "original_record",
    });

    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-verde-3`,
      sampleType: "green_coffee",
      materialState: "GREEN",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });

    expect(sample.materialState).toBe("GREEN");
  });

  it("control: una muestra de proceso (no verde) NO exige almacenamiento", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-proceso-sin-secar`,
      lotType: "processing",
      organizationId,
      projectId: projectAId,
    });

    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-proceso-1`,
      sampleType: "ph_check",
      materialState: "MUCILAGE_HONEY",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });

    expect(sample.materialState).toBe("MUCILAGE_HONEY");
  });
});
