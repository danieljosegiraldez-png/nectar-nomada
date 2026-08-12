/**
 * T12.5. `requestLotAssetUpload`'s success path calls the real R2 adapter
 * (`putObject`) and cannot be exercised — no R2 credentials exist in any
 * environment (confirmed live, `20_CAPTURE_OR_LOSE_IT_REPORT.md`'s sibling
 * media-readiness investigation). This file tests everything that runs
 * before that call (RBAC, lot lookup) plus the whole of
 * `finalizeLotAssetUpload`, which never touches object storage at all.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, TraceabilityAccessError } from "../../lib/traceability/lots";
import { requestLotAssetUpload, finalizeLotAssetUpload } from "../../lib/traceability/media";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `t12-5-media-${Date.now()}`;

let projectAId: string;
let projectBId: string;
let authorizedUserAccountId: string; // Farm Operator, scope: project A
let wrongProjectUserAccountId: string; // Farm Operator, scope: project B
let unauthorizedUserAccountId: string; // no Assignment at all
let lotId: string;

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
  const projectA = await prisma.project.create({ data: { name: `TEST Project A (${RUN_ID})`, status: "approved", classification: "internal" } });
  projectAId = projectA.id;
  const projectB = await prisma.project.create({ data: { name: `TEST Project B (${RUN_ID})`, status: "approved", classification: "internal" } });
  projectBId = projectB.id;

  authorizedUserAccountId = await createTestUserAccount("AuthorizedOperator");
  await assignFarmOperator(authorizedUserAccountId, projectAId);
  wrongProjectUserAccountId = await createTestUserAccount("WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, projectBId);
  unauthorizedUserAccountId = await createTestUserAccount("Unauthorized");

  const lot = await createLot(authorizedUserAccountId, { lotCode: `${RUN_ID}-lot`, lotType: "cherry", projectId: projectAId });
  lotId = lot.id;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: assertDefinedWhere({ lotId }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: lotId }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [authorizedUserAccountId, wrongProjectUserAccountId, unauthorizedUserAccountId] } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }] }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [authorizedUserAccountId, wrongProjectUserAccountId, unauthorizedUserAccountId] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectAId, projectBId] } }) });
});

describe("requestLotAssetUpload — RBAC (pre-R2 guard clauses only)", () => {
  it("rejects a user with no access to the lot's project before reaching object storage", async () => {
    await expect(
      requestLotAssetUpload(wrongProjectUserAccountId, { lotId, originalFilename: "photo.jpg", contentType: "image/jpeg" }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("rejects a user with no Assignment at all", async () => {
    await expect(
      requestLotAssetUpload(unauthorizedUserAccountId, { lotId, originalFilename: "photo.jpg", contentType: "image/jpeg" }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("rejects an unknown lotId", async () => {
    await expect(
      requestLotAssetUpload(authorizedUserAccountId, {
        lotId: "00000000-0000-0000-0000-000000000000",
        originalFilename: "photo.jpg",
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });
});

describe("finalizeLotAssetUpload", () => {
  let keySuffix = 0;
  const storageKeyFor = (id: string) => `nectar-originals/traceability/${id}/test-${keySuffix++}.jpg`;

  it("rejects a user with no access to the lot", async () => {
    await expect(
      finalizeLotAssetUpload(wrongProjectUserAccountId, {
        lotId,
        storageKey: storageKeyFor(lotId),
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        originalFilename: "photo.jpg",
        parent: { kind: "lot" },
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("rejects a storage key that doesn't match this lot's own prefix (§4/§3's invalid_storage_key guard)", async () => {
    await expect(
      finalizeLotAssetUpload(authorizedUserAccountId, {
        lotId,
        storageKey: "nectar-originals/traceability/some-other-lot/test.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        originalFilename: "photo.jpg",
        parent: { kind: "lot" },
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("creates an Asset with provenanceClass honored verbatim, classification defaulted to internal, and the correct parent FK set", async () => {
    const asset = await finalizeLotAssetUpload(authorizedUserAccountId, {
      lotId,
      storageKey: storageKeyFor(lotId),
      mimeType: "image/jpeg",
      sizeBytes: 2048,
      originalFilename: "drying-bed.jpg",
      parent: { kind: "lot" },
      provenanceClass: "direct_observation",
    });

    expect(asset.provenanceClass).toBe("direct_observation");
    expect(asset.classification).toBe("internal");
    expect(asset.lotId).toBe(lotId);
    expect(asset.harvestEventId).toBeNull();
    expect(asset.assetType).toBe("photo");
  });

  it("§3: creatorPersonId defaults to the uploader's own Person when not given", async () => {
    const uploaderAccount = await prisma.userAccount.findUniqueOrThrow({ where: { id: authorizedUserAccountId } });

    const asset = await finalizeLotAssetUpload(authorizedUserAccountId, {
      lotId,
      storageKey: storageKeyFor(lotId),
      mimeType: "image/jpeg",
      sizeBytes: 2048,
      originalFilename: "default-creator.jpg",
      parent: { kind: "lot" },
      provenanceClass: "direct_observation",
    });

    expect(asset.creatorPersonId).toBe(uploaderAccount.personId);
  });

  it("§3: creatorPersonId is overridable to a different Person (the same bug T9.5 fixed for operatorPersonId)", async () => {
    const otherPerson = await prisma.person.create({
      data: { givenName: "TEST", familyName: "PhotoTaker", displayName: `TEST PhotoTaker (${RUN_ID})`, locale: "en" },
    });

    try {
      const asset = await finalizeLotAssetUpload(authorizedUserAccountId, {
        lotId,
        storageKey: storageKeyFor(lotId),
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        originalFilename: "overridden-creator.jpg",
        parent: { kind: "lot" },
        provenanceClass: "direct_observation",
        creatorPersonId: otherPerson.id,
      });

      const uploaderAccount = await prisma.userAccount.findUniqueOrThrow({ where: { id: authorizedUserAccountId } });
      expect(asset.creatorPersonId).toBe(otherPerson.id);
      expect(asset.creatorPersonId).not.toBe(uploaderAccount.personId);
      expect(asset.createdBy).toBe(authorizedUserAccountId); // uploader is still createdBy, regardless of who took the photo
    } finally {
      await prisma.person.delete({ where: { id: otherPerson.id } });
    }
  });
});
