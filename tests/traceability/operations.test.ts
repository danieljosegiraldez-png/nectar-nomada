/**
 * T12.6 (docs/implementation/20_CAPTURE_OR_LOSE_IT_REPORT.md). Labour-time
 * and material-consumption capture — RBAC, required-field validation, and
 * all four/two parent kinds, against real Neon.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, TraceabilityAccessError } from "../../lib/traceability/lots";
import { recordHarvestEvent, recordReceivingEvent } from "../../lib/traceability/harvest";
import { startFermentationRun } from "../../lib/traceability/fermentation";
import { startDryingRun } from "../../lib/traceability/drying";
import {
  recordLabourEntry,
  recordMaterialConsumptionEntry,
  LabourValidationError,
  MaterialConsumptionValidationError,
} from "../../lib/traceability/operations";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `t12-6-ops-${Date.now()}`;


let organizationId: string;
let projectAId: string;
let projectBId: string;
let locationId: string;
let authorizedUserAccountId: string;
let wrongProjectUserAccountId: string;

let harvestLotId: string;
let harvestEventId: string;
let receivingLotId: string;
let receivingEventId: string;
let fermentationRunId: string;
let dryingLotId: string;
let dryingRunId: string;

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "en" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

async function assignFarmOperator(userAccountId: string, projectRefId: string) {
  const farmOperatorProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectRefId } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperatorProfile.id, scopeId: scope.id } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const projectA = await prisma.project.create({ data: { name: `TEST Project A (${RUN_ID})`, status: "approved", classification: "internal" } });
  projectAId = projectA.id;
  const projectB = await prisma.project.create({ data: { name: `TEST Project B (${RUN_ID})`, status: "approved", classification: "internal" } });
  projectBId = projectB.id;

  const location = await prisma.location.create({
    // Una parcela, no un sitio: desde el 2026-09-18 `recordHarvestEvent` rechaza cosechar sobre
    // cualquier cosa que no sea `plot` (spec fincas y parcelas §3.4). El nombre ya decía «Plot».
    data: { locationType: "plot", name: `TEST Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = location.id;

  authorizedUserAccountId = await createTestUserAccount("OpsOperator");
  await assignFarmOperator(authorizedUserAccountId, projectAId);
  wrongProjectUserAccountId = await createTestUserAccount("OpsWrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, projectBId);

  const { harvestEvent, lot: hLot } = await recordHarvestEvent(authorizedUserAccountId, {
    lotCode: `${RUN_ID}-cherry`,
    locationId,
    organizationId,
    projectId: projectAId,
    harvestedAt: new Date("2027-01-15T08:00:00Z"),
    provenanceClass: "measured_fact",
  });
  harvestLotId = hLot.id;
  harvestEventId = harvestEvent.id;

  const { receivingEvent, lot: rLot } = await recordReceivingEvent(authorizedUserAccountId, {
    lotCode: `${RUN_ID}-received`,
    organizationId,
    projectId: projectAId,
    receivedAt: new Date("2027-01-16T08:00:00Z"),
    provenanceClass: "measured_fact",
  });
  receivingLotId = rLot.id;
  receivingEventId = receivingEvent.id;

  const { run: fermentationRun } = await startFermentationRun(authorizedUserAccountId, {
    lotId: harvestLotId,
    startedAt: new Date("2027-01-15T10:00:00Z"),
    provenanceClass: "original_record",
  });
  fermentationRunId = fermentationRun.id;

  const dLot = await createLot(authorizedUserAccountId, { lotCode: `${RUN_ID}-drying-source`, lotType: "drying", organizationId, projectId: projectAId });
  dryingLotId = dLot.id;
  const { run: dryingRun } = await startDryingRun(authorizedUserAccountId, {
    lotId: dryingLotId,
    startedAt: new Date("2027-01-20T10:00:00Z"),
    provenanceClass: "original_record",
  });
  dryingRunId = dryingRun.id;
});

afterAll(async () => {
  await prisma.labourEntry.deleteMany({
    where: assertDefinedWhere({ OR: [{ harvestEventId }, { receivingEventId }, { fermentationRunId }, { dryingRunId }] }),
  });
  await prisma.materialConsumptionEntry.deleteMany({ where: assertDefinedWhere({ OR: [{ fermentationRunId }, { dryingRunId }] }) });

  const allLotIds = [harvestLotId, receivingLotId, dryingLotId];
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: allLotIds } }) });
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: allLotIds } } } }, { outputs: { some: { lotId: { in: allLotIds } } } }] }),
  });
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: fermentationRunId }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: dryingRunId }) });
  await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ id: harvestEventId }) });
  await prisma.receivingEvent.deleteMany({ where: assertDefinedWhere({ id: receivingEventId }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: allLotIds } }) });

  const userAccountIds = [authorizedUserAccountId, wrongProjectUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [projectAId, projectBId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectAId, projectBId] } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("recordLabourEntry", () => {
  it("rejects a user with no access to the lot's project", async () => {
    await expect(
      recordLabourEntry(wrongProjectUserAccountId, {
        lotId: harvestLotId,
        parent: { kind: "harvestEvent", harvestEventId },
        workerCount: 4,
        hours: 3,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("rejects a non-positive workerCount", async () => {
    await expect(
      recordLabourEntry(authorizedUserAccountId, {
        lotId: harvestLotId,
        parent: { kind: "harvestEvent", harvestEventId },
        workerCount: 0,
        hours: 3,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(LabourValidationError);
  });

  it("rejects a non-positive hours value", async () => {
    await expect(
      recordLabourEntry(authorizedUserAccountId, {
        lotId: harvestLotId,
        parent: { kind: "harvestEvent", harvestEventId },
        workerCount: 4,
        hours: 0,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(LabourValidationError);
  });

  it("records against a HarvestEvent — the golden path (four people, three hours)", async () => {
    const entry = await recordLabourEntry(authorizedUserAccountId, {
      lotId: harvestLotId,
      parent: { kind: "harvestEvent", harvestEventId },
      workerCount: 4,
      hours: 3,
      provenanceClass: "direct_observation",
    });
    expect(entry.workerCount).toBe(4);
    expect(entry.hours.toString()).toBe("3");
    expect(entry.harvestEventId).toBe(harvestEventId);
    expect(entry.receivingEventId).toBeNull();
    expect(entry.fermentationRunId).toBeNull();
    expect(entry.dryingRunId).toBeNull();
    expect(entry.provenanceClass).toBe("direct_observation");
  });

  it("records against a ReceivingEvent", async () => {
    const entry = await recordLabourEntry(authorizedUserAccountId, {
      lotId: receivingLotId,
      parent: { kind: "receivingEvent", receivingEventId },
      workerCount: 2,
      hours: 1.5,
      provenanceClass: "direct_observation",
    });
    expect(entry.receivingEventId).toBe(receivingEventId);
  });

  it("records against a FermentationRun, with an in-kind organization and a task note", async () => {
    const entry = await recordLabourEntry(authorizedUserAccountId, {
      lotId: harvestLotId,
      parent: { kind: "fermentationRun", fermentationRunId },
      workerCount: 3,
      hours: 2,
      taskNote: "tank cleaning",
      providedByOrganizationId: organizationId,
      provenanceClass: "direct_observation",
    });
    expect(entry.fermentationRunId).toBe(fermentationRunId);
    expect(entry.taskNote).toBe("tank cleaning");
    expect(entry.providedByOrganizationId).toBe(organizationId);
  });

  it("records against a DryingRun, and defaults dataQuality to null when not given", async () => {
    const entry = await recordLabourEntry(authorizedUserAccountId, {
      lotId: dryingLotId,
      parent: { kind: "dryingRun", dryingRunId },
      workerCount: 1,
      hours: 5,
      provenanceClass: "direct_observation",
    });
    expect(entry.dryingRunId).toBe(dryingRunId);
    expect(entry.dataQuality).toBeNull();
  });

  it("honors an explicit dataQuality, independent of provenanceClass (source report §2's two-axis distinction)", async () => {
    const entry = await recordLabourEntry(authorizedUserAccountId, {
      lotId: harvestLotId,
      parent: { kind: "harvestEvent", harvestEventId },
      workerCount: 4,
      hours: 3,
      provenanceClass: "direct_observation",
      dataQuality: "provisional",
    });
    expect(entry.provenanceClass).toBe("direct_observation");
    expect(entry.dataQuality).toBe("provisional");
  });
});

describe("recordMaterialConsumptionEntry", () => {
  it("rejects a user with no access to the lot's project", async () => {
    await expect(
      recordMaterialConsumptionEntry(wrongProjectUserAccountId, {
        lotId: harvestLotId,
        parent: { kind: "fermentationRun", fermentationRunId },
        materialName: "Yeast",
        batchLabel: "BATCH-1",
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("rejects an empty materialName", async () => {
    await expect(
      recordMaterialConsumptionEntry(authorizedUserAccountId, {
        lotId: harvestLotId,
        parent: { kind: "fermentationRun", fermentationRunId },
        materialName: "   ",
        batchLabel: "BATCH-1",
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(MaterialConsumptionValidationError);
  });

  it("rejects an empty batchLabel — the one irrecoverable identity fact", async () => {
    await expect(
      recordMaterialConsumptionEntry(authorizedUserAccountId, {
        lotId: harvestLotId,
        parent: { kind: "fermentationRun", fermentationRunId },
        materialName: "Saccharomyces cerevisiae",
        batchLabel: "",
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(MaterialConsumptionValidationError);
  });

  it("records 2kg of a named yeast batch on a FermentationRun — the golden path", async () => {
    const entry = await recordMaterialConsumptionEntry(authorizedUserAccountId, {
      lotId: harvestLotId,
      parent: { kind: "fermentationRun", fermentationRunId },
      materialName: "Saccharomyces cerevisiae",
      batchLabel: "LOT-2027-YEAST-04",
      quantity: 2,
      unit: "kg",
      provenanceClass: "direct_observation",
    });
    expect(entry.materialName).toBe("Saccharomyces cerevisiae");
    expect(entry.batchLabel).toBe("LOT-2027-YEAST-04");
    expect(entry.quantity?.toString()).toBe("2");
    expect(entry.unit).toBe("kg");
    expect(entry.fermentationRunId).toBe(fermentationRunId);
    expect(entry.dryingRunId).toBeNull();
  });

  it("records against a DryingRun with quantity/unit omitted — an approximate amount is still worth capturing (DATA_ARCHITECTURE.md §4)", async () => {
    const entry = await recordMaterialConsumptionEntry(authorizedUserAccountId, {
      lotId: dryingLotId,
      parent: { kind: "dryingRun", dryingRunId },
      materialName: "Diatomaceous earth treatment",
      batchLabel: "TREAT-2027-01",
      notes: "roughly a handful, no scale on site",
      provenanceClass: "direct_observation",
    });
    expect(entry.dryingRunId).toBe(dryingRunId);
    expect(entry.quantity).toBeNull();
    expect(entry.unit).toBeNull();
    expect(entry.notes).toBe("roughly a handful, no scale on site");
  });
});
