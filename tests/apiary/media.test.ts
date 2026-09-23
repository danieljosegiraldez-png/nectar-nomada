/**
 * A6. Same reasoning as tests/traceability/media.test.ts: `requestApiaryAssetUpload`'s
 * success path calls the real R2 adapter and cannot be exercised in this
 * environment. This file tests everything that runs before that call
 * (RBAC, parent lookup) plus the whole of `finalizeApiaryAssetUpload`,
 * which never touches object storage at all.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony, ApiaryAccessError } from "../../lib/apiary/hives";
import { recordInspection } from "../../lib/apiary/inspections";
import { recordColonyEvent } from "../../lib/apiary/colonyEvents";
import { requestApiaryAssetUpload, finalizeApiaryAssetUpload } from "../../lib/apiary/media";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a6-media-${Date.now()}`;

let organizationId: string;
let apiarySiteId: string;
let projectAId: string;
let projectBId: string;
let hiveId: string;
let colonyId: string;
let inspectionId: string;
let colonyEventId: string;

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

async function assignFarmOperator(userAccountId: string, projectId: string) {
  const farmOperatorProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperatorProfile.id, scopeId: scope.id } });
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

  const projectA = await prisma.project.create({ data: { name: `TEST Project A (${RUN_ID})`, status: "approved", classification: "internal" } });
  projectAId = projectA.id;
  const projectB = await prisma.project.create({ data: { name: `TEST Project B (${RUN_ID})`, status: "approved", classification: "internal" } });
  projectBId = projectB.id;

  authorizedUserAccountId = await createTestUserAccount("AuthorizedOperator");
  await assignFarmOperator(authorizedUserAccountId, projectAId);
  wrongProjectUserAccountId = await createTestUserAccount("WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, projectBId);
  unauthorizedUserAccountId = await createTestUserAccount("Unauthorized");

  const hive = await createHive(authorizedUserAccountId, { identifier: `${RUN_ID}-H-001`, locationId: apiarySiteId, projectId: projectAId });
  hiveId = hive.id;
  const colony = await createColony(authorizedUserAccountId, {
    hiveId,
    startedAt: new Date("2026-01-01"),
    originType: "captured",
    provenanceClass: "direct_observation",
  });
  colonyId = colony.id;
  const inspection = await recordInspection(authorizedUserAccountId, { colonyId, outcome: "nothing_unusual" });
  inspectionId = inspection.id;
  const colonyEvent = await recordColonyEvent(authorizedUserAccountId, { colonyId, eventType: "passing_observation", note: "test" });
  colonyEventId = colonyEvent.id;
});

afterAll(async () => {
  await prisma.asset.deleteMany({
    where: assertDefinedWhere({ OR: [{ hiveId }, { colonyId }, { inspectionId }, { colonyEventId }] }),
  });
  await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId }) });
  await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: colonyId }) });
  // La colocación es hija de la colmena y su FK es RESTRICT: sin esta línea el borrado
  // de abajo falla. `createHive` abre una desde el 2026-09-15 (ADR-135).
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { id: hiveId } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: hiveId }) });

  const userAccountIds = [authorizedUserAccountId, wrongProjectUserAccountId, unauthorizedUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }] }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: apiarySiteId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectAId, projectBId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("requestApiaryAssetUpload — RBAC (pre-R2 guard clauses only)", () => {
  it("rejects a user with no access to the hive's project", async () => {
    await expect(
      requestApiaryAssetUpload(wrongProjectUserAccountId, {
        parent: { kind: "hive", hiveId },
        originalFilename: "photo.jpg",
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow(ApiaryAccessError);
  });

  it("rejects a user with no Assignment at all", async () => {
    await expect(
      requestApiaryAssetUpload(unauthorizedUserAccountId, {
        parent: { kind: "colony", colonyId },
        originalFilename: "photo.jpg",
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow(ApiaryAccessError);
  });

  it("rejects an unknown hiveId", async () => {
    await expect(
      requestApiaryAssetUpload(authorizedUserAccountId, {
        parent: { kind: "hive", hiveId: "00000000-0000-0000-0000-000000000000" },
        originalFilename: "photo.jpg",
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow(ApiaryAccessError);
  });
});

describe("finalizeApiaryAssetUpload", () => {
  let keySuffix = 0;
  const storageKeyFor = (parentKind: string) => `nectar-originals/apiary/${parentKind}/${RUN_ID}-${keySuffix++}.jpg`;

  it("rejects a user with no access to the parent's project", async () => {
    await expect(
      finalizeApiaryAssetUpload(wrongProjectUserAccountId, {
        parent: { kind: "hive", hiveId },
        storageKey: storageKeyFor("hive"),
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        originalFilename: "photo.jpg",
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(ApiaryAccessError);
  });

  it("rejects a storage key that doesn't match this parent kind's own prefix", async () => {
    await expect(
      finalizeApiaryAssetUpload(authorizedUserAccountId, {
        parent: { kind: "hive", hiveId },
        storageKey: "nectar-originals/apiary/colony/wrong-prefix.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        originalFilename: "photo.jpg",
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(ApiaryAccessError);
  });

  it("creates an Asset with the correct FK for each of the four parent kinds", async () => {
    const hiveAsset = await finalizeApiaryAssetUpload(authorizedUserAccountId, {
      parent: { kind: "hive", hiveId },
      storageKey: storageKeyFor("hive"),
      mimeType: "image/jpeg",
      sizeBytes: 2048,
      originalFilename: "hive.jpg",
      provenanceClass: "direct_observation",
    });
    expect(hiveAsset.hiveId).toBe(hiveId);
    expect(hiveAsset.colonyId).toBeNull();

    const colonyAsset = await finalizeApiaryAssetUpload(authorizedUserAccountId, {
      parent: { kind: "colony", colonyId },
      storageKey: storageKeyFor("colony"),
      mimeType: "image/jpeg",
      sizeBytes: 2048,
      originalFilename: "colony.jpg",
      provenanceClass: "direct_observation",
    });
    expect(colonyAsset.colonyId).toBe(colonyId);

    const inspectionAsset = await finalizeApiaryAssetUpload(authorizedUserAccountId, {
      parent: { kind: "inspection", inspectionId },
      storageKey: storageKeyFor("inspection"),
      mimeType: "image/jpeg",
      sizeBytes: 2048,
      originalFilename: "inspection.jpg",
      provenanceClass: "direct_observation",
    });
    expect(inspectionAsset.inspectionId).toBe(inspectionId);

    const colonyEventAsset = await finalizeApiaryAssetUpload(authorizedUserAccountId, {
      parent: { kind: "colonyEvent", colonyEventId },
      storageKey: storageKeyFor("colonyEvent"),
      mimeType: "image/jpeg",
      sizeBytes: 2048,
      originalFilename: "colony-event.jpg",
      provenanceClass: "direct_observation",
    });
    expect(colonyEventAsset.colonyEventId).toBe(colonyEventId);

    expect(hiveAsset.classification).toBe("internal");
    expect(hiveAsset.assetType).toBe("photo");
  });

  it("§3: creatorPersonId defaults to the uploader's own Person when not given, overridable otherwise", async () => {
    const uploaderAccount = await prisma.userAccount.findUniqueOrThrow({ where: { id: authorizedUserAccountId } });

    const defaulted = await finalizeApiaryAssetUpload(authorizedUserAccountId, {
      parent: { kind: "hive", hiveId },
      storageKey: storageKeyFor("hive"),
      mimeType: "image/jpeg",
      sizeBytes: 2048,
      originalFilename: "default-creator.jpg",
      provenanceClass: "direct_observation",
    });
    expect(defaulted.creatorPersonId).toBe(uploaderAccount.personId);

    const otherPerson = await prisma.person.create({
      data: { givenName: "TEST", familyName: "PhotoTaker", displayName: `TEST PhotoTaker (${RUN_ID})`, locale: "en" },
    });
    await prisma.organizationMembership.create({ data: { personId: otherPerson.id, organizationId } });
    try {
      const overridden = await finalizeApiaryAssetUpload(authorizedUserAccountId, {
        parent: { kind: "hive", hiveId },
        storageKey: storageKeyFor("hive"),
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        originalFilename: "overridden-creator.jpg",
        provenanceClass: "direct_observation",
        creatorPersonId: otherPerson.id,
      });
      expect(overridden.creatorPersonId).toBe(otherPerson.id);
      expect(overridden.createdBy).toBe(authorizedUserAccountId);
    } finally {
      await prisma.organizationMembership.deleteMany({ where: { personId: otherPerson.id } });
      await prisma.person.delete({ where: { id: otherPerson.id } });
    }
  });
});
