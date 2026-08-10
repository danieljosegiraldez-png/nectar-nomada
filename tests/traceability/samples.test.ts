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
import { createSampleFromLot } from "../../lib/traceability/samples";

const RUN_ID = `t5-${Date.now()}`;

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

  await prisma.sample.deleteMany({ where: { sampleCode: { startsWith: RUN_ID } } });
  await prisma.quantityEvent.deleteMany({ where: { lotId: { in: lotIds } } });
  await prisma.lotTransformation.deleteMany({
    where: { OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] },
  });
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } });

  await prisma.assignment.deleteMany({
    where: { userAccountId: { in: [authorizedUserAccountId, wrongProjectUserAccountId] } },
  });
  await prisma.scope.deleteMany({ where: { OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }] } });
  await prisma.userAccount.deleteMany({
    where: { id: { in: [authorizedUserAccountId, wrongProjectUserAccountId, unauthorizedUserAccountId] } },
  });
  await prisma.person.deleteMany({ where: { displayName: { contains: RUN_ID } } });
  await prisma.project.deleteMany({ where: { id: { in: [projectAId, projectBId] } } });
});

describe("createSampleFromLot — lineage, RBAC, quantity accounting", () => {
  it("creates a Sample linked back to its source Lot via a sample_extraction transformation", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sample-ok`,
      lotType: "green",
      projectId: projectAId,
    });

    const { transformation, sample } = await createSampleFromLot(authorizedUserAccountId, {
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
      projectId: projectAId,
    });

    await expect(
      createSampleFromLot(wrongProjectUserAccountId, {
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
      projectId: projectAId,
    });

    await expect(
      createSampleFromLot(unauthorizedUserAccountId, {
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
      projectId: projectAId,
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      lotId: lot.id,
      eventType: "received",
      quantity: 100,
      unit: "kg",
      occurredAt: new Date("2026-01-01"),
    });

    await createSampleFromLot(authorizedUserAccountId, {
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
      projectId: projectAId,
    });

    await createSampleFromLot(authorizedUserAccountId, {
      sampleCode: `${RUN_ID}-S005`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });

    const events = await prisma.quantityEvent.findMany({ where: { lotId: lot.id } });
    expect(events).toHaveLength(0);
  });
});
