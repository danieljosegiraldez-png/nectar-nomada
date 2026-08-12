/**
 * Ticket A3 (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md §2-3). Real
 * Postgres (Neon), no mocks. Beyond recordApiaryHarvest itself, this file
 * exists to test §2's central architectural claim directly: a honey Lot
 * reuses Sample/Measurement/QuantityEvent/Asset with zero new code, by
 * calling the real, unmodified T2/T3/T5/T12.5 functions against a Lot this
 * ticket produced — not by re-reading their source and asserting they
 * "should" work.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { ApiaryAccessError, createColony, createHive } from "../../lib/apiary/hives";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { createSampleFromLot } from "../../lib/traceability/samples";
import { recordMeasurement } from "../../lib/traceability/measurements";
import { computeCurrentQuantity } from "../../lib/traceability/quantity";
import { finalizeLotAssetUpload, requestLotAssetUpload } from "../../lib/traceability/media";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a3-${Date.now()}`;

let organizationId: string;
let projectAId: string;
let projectBId: string;
let apiarySiteId: string;
let colonyId: string;

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
  const testLots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = testLots.map((l) => l.id);

  await prisma.asset.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] }),
  });
  await prisma.apiaryHarvestEvent.deleteMany({ where: assertDefinedWhere({ resultingLotId: { in: lotIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });

  await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: colonyId }) });
  const testHives = await prisma.hive.findMany({ where: { identifier: { startsWith: RUN_ID } } });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: testHives.map((h) => h.id) } }) });

  const userAccountIds = [authorizedUserAccountId, wrongProjectUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }] }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: apiarySiteId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectAId, projectBId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("recordApiaryHarvest", () => {
  it("produces a Lot(lotType honey) inheriting organization/project/location from the Colony's own Hive", async () => {
    const { lot, harvestEvent } = await recordApiaryHarvest(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-basic`,
      colonyId,
      occurredAt: new Date("2026-04-01"),
      framesHarvested: 6,
      provenanceClass: "measured_fact",
    });

    expect(lot.lotType).toBe("honey");
    expect(lot.locationId).toBe(apiarySiteId);
    expect(lot.projectId).toBe(projectAId);
    expect(lot.organizationId).toBe(organizationId);
    expect(harvestEvent.resultingLotId).toBe(lot.id);
    expect(harvestEvent.framesHarvested).toBe(6);
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    await expect(
      recordApiaryHarvest(wrongProjectUserAccountId, {
        lotCode: `${RUN_ID}-denied`,
        colonyId,
        occurredAt: new Date("2026-04-01"),
        provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow(ApiaryAccessError);
  });

  it("rejects an unknown colonyId", async () => {
    await expect(
      recordApiaryHarvest(authorizedUserAccountId, {
        lotCode: `${RUN_ID}-unknown-colony`,
        colonyId: "00000000-0000-0000-0000-000000000000",
        occurredAt: new Date("2026-04-01"),
        provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow(ApiaryAccessError);
  });
});

describe("chain reuse — the central claim of 22_APIARY_V1_SCOPING_REPORT.md §2", () => {
  it("QuantityEvent: extractedWeightKg produces a real 'received' event, computeCurrentQuantity sums it with zero new code", async () => {
    const { lot } = await recordApiaryHarvest(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-quantity`,
      colonyId,
      occurredAt: new Date("2026-04-05"),
      extractedWeightKg: 18.5,
      provenanceClass: "measured_fact",
    });

    const events = await prisma.quantityEvent.findMany({ where: { lotId: lot.id } });
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("received");
    expect(Number(events[0]?.quantity)).toBe(18.5);

    const current = await computeCurrentQuantity(authorizedUserAccountId, lot.id);
    expect(Number(current.quantity)).toBe(18.5);
  });

  it("Sample: createSampleFromLot works unmodified against the honey Lot (sample:manage, already held by Farm Operator)", async () => {
    const { lot } = await recordApiaryHarvest(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sample`,
      colonyId,
      occurredAt: new Date("2026-04-06"),
      extractedWeightKg: 10,
      provenanceClass: "measured_fact",
    });

    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      sampleCode: `${RUN_ID}-CUP-001`,
      sampleType: "honey_cupping",
      sourceLotId: lot.id,
      quantity: 0.2,
      unit: "kg",
      occurredAt: new Date("2026-04-07"),
      provenanceClass: "original_record",
    });

    expect(sample.sourceLotId).toBe(lot.id);

    // The extraction is a real LotTransformation, the same shape coffee's
    // own sample_extraction uses — proving this isn't a special-cased path.
    const transformation = await prisma.lotTransformation.findFirst({
      where: { inputs: { some: { lotId: lot.id } } },
    });
    expect(transformation?.transformationType).toBe("sample_extraction");
  });

  it("Measurement: recordMeasurement works unmodified against the honey Lot (lot:manage)", async () => {
    const { lot } = await recordApiaryHarvest(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-measurement`,
      colonyId,
      occurredAt: new Date("2026-04-08"),
      provenanceClass: "measured_fact",
    });

    const measurement = await recordMeasurement(authorizedUserAccountId, {
      variable: "moisture",
      value: 17.2,
      unit: "%",
      occurredAt: new Date("2026-04-09"),
      lotId: lot.id,
      provenanceClass: "measured_fact",
    });

    expect(measurement.lotId).toBe(lot.id);
    expect(measurement.variable).toBe("moisture");
  });

  it("Asset: requestLotAssetUpload/finalizeLotAssetUpload work unmodified against the honey Lot (lot:manage)", async () => {
    const { lot } = await recordApiaryHarvest(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-asset`,
      colonyId,
      occurredAt: new Date("2026-04-10"),
      provenanceClass: "measured_fact",
    });

    // Pre-R2 RBAC guard denies a wrong-project operator before object
    // storage is ever reached — same shape T12.5's own test suite uses,
    // since no R2 credentials exist in this environment.
    await expect(
      requestLotAssetUpload(wrongProjectUserAccountId, { lotId: lot.id, originalFilename: "frame.jpg", contentType: "image/jpeg" }),
    ).rejects.toThrow(TraceabilityAccessError);

    const asset = await finalizeLotAssetUpload(authorizedUserAccountId, {
      lotId: lot.id,
      storageKey: `nectar-originals/traceability/${lot.id}/test.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      originalFilename: "extracted-honey.jpg",
      parent: { kind: "lot" },
      provenanceClass: "direct_observation",
    });

    expect(asset.lotId).toBe(lot.id);
    expect(asset.assetType).toBe("photo");
  });
});
