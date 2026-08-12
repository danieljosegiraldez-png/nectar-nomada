/**
 * Phase 1, ticket T4 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §34). Real Postgres (Neon), no mocks — same discipline as
 * tests/traceability/lots.test.ts, quantity.test.ts, measurements.test.ts.
 * DoD: "A real DEMO harvest creates a Lot end-to-end."
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { recordTransformation, TraceabilityAccessError } from "../../lib/traceability/lots";
import { computeCurrentQuantity } from "../../lib/traceability/quantity";
import { recordHarvestEvent, recordReceivingEvent } from "../../lib/traceability/harvest";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `t4-${Date.now()}`;

let farmOrganizationId: string;
let supplierOrganizationId: string;
let projectAId: string;
let projectBId: string;
let plotLocationId: string;

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
  const farmOrganization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  farmOrganizationId = farmOrganization.id;

  const supplierOrganization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Supplier (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  supplierOrganizationId = supplierOrganization.id;

  const site = await prisma.location.create({
    data: { locationType: "site", name: `TEST Farm Site (${RUN_ID})`, organizationId: farmOrganizationId, status: "approved", classification: "internal" },
  });

  const plot = await prisma.location.create({
    data: {
      locationType: "plot",
      name: `TEST Plot 1 (${RUN_ID})`,
      organizationId: farmOrganizationId,
      parentLocationId: site.id,
      status: "approved",
      classification: "internal",
    },
  });
  plotLocationId = plot.id;

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

  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] }),
  });
  await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ resultingLotId: { in: lotIds } }) });
  await prisma.receivingEvent.deleteMany({ where: assertDefinedWhere({ resultingLotId: { in: lotIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });

  await prisma.assignment.deleteMany({
    where: assertDefinedWhere({ userAccountId: { in: [authorizedUserAccountId, wrongProjectUserAccountId] } }),
  });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }] }) });
  await prisma.userAccount.deleteMany({
    where: assertDefinedWhere({ id: { in: [authorizedUserAccountId, wrongProjectUserAccountId] } }),
  });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ organizationId: farmOrganizationId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectAId, projectBId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: [farmOrganizationId, supplierOrganizationId] } }) });
});

describe("recordHarvestEvent — creates the origin Lot end-to-end", () => {
  it("allows a project-scoped Farm Operator to record a harvest at their project's plot", async () => {
    const { harvestEvent, lot } = await recordHarvestEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotCode: `${RUN_ID}-harvest-ok`,
      locationId: plotLocationId,
      organizationId: farmOrganizationId,
      projectId: projectAId,
      harvestedAt: new Date("2026-01-01"),
      cherryWeightKg: 480,
      brix: 22,
      condition: "ripe, hand-picked",
    });

    expect(lot.lotType).toBe("cherry");
    expect(lot.projectId).toBe(projectAId);
    expect(lot.locationId).toBe(plotLocationId);
    expect(harvestEvent.resultingLotId).toBe(lot.id);

    // §9's invariant holds from the lot's very first moment: the harvested
    // weight is queryable as this lot's current quantity, not just a
    // scalar snapshot on HarvestEvent.
    const quantity = await computeCurrentQuantity(authorizedUserAccountId, lot.id);
    expect(quantity.quantity.toNumber()).toBe(480);
    expect(quantity.unit).toBe("kg");
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    await expect(
      recordHarvestEvent(wrongProjectUserAccountId, {
        provenanceClass: "measured_fact",
        lotCode: `${RUN_ID}-harvest-denied`,
        locationId: plotLocationId,
        organizationId: farmOrganizationId,
        projectId: projectAId,
        harvestedAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("creates no QuantityEvent when cherryWeightKg is not recorded (missing stays missing, never fabricated)", async () => {
    const { lot } = await recordHarvestEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotCode: `${RUN_ID}-harvest-no-weight`,
      locationId: plotLocationId,
      organizationId: farmOrganizationId,
      projectId: projectAId,
      harvestedAt: new Date(),
    });

    const events = await prisma.quantityEvent.findMany({ where: { lotId: lot.id } });
    expect(events).toHaveLength(0);
    const quantity = await computeCurrentQuantity(authorizedUserAccountId, lot.id);
    expect(quantity.quantity.toNumber()).toBe(0);
    expect(quantity.unit).toBeNull();
  });

  it("end-to-end: a harvested lot can be split immediately afterward, composing with T1's transformation machinery", async () => {
    const { lot: harvestLot } = await recordHarvestEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotCode: `${RUN_ID}-harvest-then-split`,
      locationId: plotLocationId,
      organizationId: farmOrganizationId,
      projectId: projectAId,
      harvestedAt: new Date(),
      cherryWeightKg: 300,
    });

    const { outputLots } = await recordTransformation(authorizedUserAccountId, {
      provenanceClass: "original_record",
      transformationType: "split",
      occurredAt: new Date(),
      inputs: [{ lotId: harvestLot.id, quantity: 300, unit: "kg" }],
      outputs: [
        { lotCode: `${RUN_ID}-harvest-then-split-out1`, lotType: "processing", quantity: 200, unit: "kg" },
        { lotCode: `${RUN_ID}-harvest-then-split-out2`, lotType: "processing", quantity: 100, unit: "kg" },
      ],
    });

    expect(outputLots).toHaveLength(2);
    for (const outputLot of outputLots) {
      expect(outputLot.projectId).toBe(projectAId);
    }
  });
});

describe("recordReceivingEvent — creates the origin Lot from an external supplier", () => {
  it("allows a project-scoped Farm Operator to record a receiving with no known location", async () => {
    const { receivingEvent, lot } = await recordReceivingEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotCode: `${RUN_ID}-receiving-ok`,
      organizationId: supplierOrganizationId,
      projectId: projectAId,
      receivedAt: new Date(),
      deliveryNote: "DN-00123",
      cherryWeightKg: 150,
    });

    expect(lot.lotType).toBe("cherry");
    expect(lot.locationId).toBeNull();
    expect(receivingEvent.resultingLotId).toBe(lot.id);

    const quantity = await computeCurrentQuantity(authorizedUserAccountId, lot.id);
    expect(quantity.quantity.toNumber()).toBe(150);
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    await expect(
      recordReceivingEvent(wrongProjectUserAccountId, {
        provenanceClass: "measured_fact",
        lotCode: `${RUN_ID}-receiving-denied`,
        organizationId: supplierOrganizationId,
        projectId: projectAId,
        receivedAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });
});
