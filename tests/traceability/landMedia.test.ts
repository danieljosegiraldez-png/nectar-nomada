/**
 * S1 (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2). Fotografía con
 * ámbito de Location.
 *
 * **Lo que este archivo NO puede probar, y se dice:** el camino feliz de
 * `requestLandAssetUpload` llama al adaptador real de R2 (`putObject`), y no
 * hay credenciales en ningún entorno de prueba. Igual que `media.test.ts`, se
 * prueba todo lo que corre ANTES de esa llamada (RBAC) y todo
 * `finalizeLandAssetUpload`, que no toca el almacenamiento. `listLandAssets`
 * pide URL firmadas, así que sólo se prueba su rechazo.
 *
 * El test que más importa está en el último describe: que el padre pertenezca
 * a la Location contra la que se autoriza. Sin él, quien tiene acceso al bloque
 * A puede colgar una foto del perfil del bloque B.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { LocationAccessError } from "../../lib/traceability/locations";
import {
  finalizeLandAssetUpload,
  LandMediaValidationError,
  listLandAssets,
  requestLandAssetUpload,
} from "../../lib/traceability/landMedia";
import { createSoilProfile } from "../../lib/traceability/soilProfiles";
import { createBiocharBatch } from "../../lib/traceability/biocharBatches";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `land-media-${Date.now()}`;

let organizationId: string;
let locationAId: string;
let locationBId: string;
let userAId: string; // Farm Operator, ámbito: bloque A
let userBId: string; // Farm Operator, ámbito: bloque B
let perfilDeBId: string;
let loteDeBId: string;
const assetIds: string[] = [];

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

async function assignFarmOperator(userAccountId: string, locationRefId: string) {
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationRefId } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const a = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Bloque A (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationAId = a.id;
  const b = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Bloque B (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationBId = b.id;

  userAId = await createTestUserAccount("LandMediaA");
  await assignFarmOperator(userAId, locationAId);
  userBId = await createTestUserAccount("LandMediaB");
  await assignFarmOperator(userBId, locationBId);

  // Un perfil y un lote de biochar que pertenecen al bloque B.
  const perfil = await createSoilProfile(userBId, {
    locationId: locationBId,
    describedAt: new Date("2026-04-20T00:00:00Z"),
    provenanceClass: "direct_observation",
  });
  perfilDeBId = perfil.id;
  const lote = await createBiocharBatch(userBId, {
    batchCode: `LN-BC-${RUN_ID}`,
    organizationId,
    producedAtLocationId: locationBId,
    provenanceClass: "original_record",
  });
  loteDeBId = lote.id;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: assertDefinedWhere({ id: { in: assetIds } }) });
  await prisma.soilHorizon.deleteMany({ where: assertDefinedWhere({ soilProfileId: perfilDeBId }) });
  await prisma.soilProfile.deleteMany({ where: assertDefinedWhere({ locationId: { in: [locationAId, locationBId] } }) });
  await prisma.biocharBatch.deleteMany({ where: assertDefinedWhere({ producedAtLocationId: { in: [locationAId, locationBId] } }) });

  const ids = [userAId, userBId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: ids } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [locationAId, locationBId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [locationAId, locationBId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("requestLandAssetUpload", () => {
  it("rechaza a quien no alcanza el bloque, antes de tocar el almacenamiento", async () => {
    await expect(
      requestLandAssetUpload(userAId, {
        locationId: locationBId,
        originalFilename: "perfil.jpg",
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow(LocationAccessError);
  });
});

describe("finalizeLandAssetUpload", () => {
  it("rechaza a quien no alcanza el bloque", async () => {
    await expect(
      finalizeLandAssetUpload(userAId, {
        locationId: locationBId,
        storageKey: `nectar-originals/land/${locationBId}/x.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100,
        originalFilename: "x.jpg",
        parent: { kind: "location" },
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("rechaza una clave que no está bajo el prefijo de ese bloque", async () => {
    // Sin esto, un llamador podría registrar como suyo un objeto ya subido bajo
    // otro bloque.
    await expect(
      finalizeLandAssetUpload(userAId, {
        locationId: locationAId,
        storageKey: `nectar-originals/land/${locationBId}/robada.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100,
        originalFilename: "robada.jpg",
        parent: { kind: "location" },
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(LandMediaValidationError);
  });

  it("guarda una foto general del bloque", async () => {
    const asset = await finalizeLandAssetUpload(userAId, {
      locationId: locationAId,
      storageKey: `nectar-originals/land/${locationAId}/${RUN_ID}-bloque.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 2048,
      originalFilename: "bloque.jpg",
      parent: { kind: "location" },
      provenanceClass: "direct_observation",
    });
    assetIds.push(asset.id);
    expect(asset.locationId).toBe(locationAId);
    expect(asset.soilProfileId).toBeNull();
    expect(asset.biocharBatchId).toBeNull();
    expect(asset.assetType).toBe("photo");
  });

  it("escribe el AuditEvent en la misma transacción", async () => {
    const evento = await prisma.auditEvent.findFirst({
      where: assertDefinedWhere({ entityType: "asset", entityId: assetIds[0], operation: "asset.create" }),
    });
    expect(evento).not.toBeNull();
  });
});

describe("el padre tiene que ser de ESE bloque", () => {
  it("no deja colgar una foto del perfil de otro bloque", async () => {
    // El agujero: userA tiene acceso al bloque A. Manda A como ámbito —así la
    // autorización pasa— y el id de un perfil del bloque B como padre. La fila
    // aterrizaría en B. El formulario nunca manda esa combinación; el servicio
    // es la frontera, no el formulario (SECURITY.md §2).
    await expect(
      finalizeLandAssetUpload(userAId, {
        locationId: locationAId,
        storageKey: `nectar-originals/land/${locationAId}/${RUN_ID}-cruzada.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100,
        originalFilename: "cruzada.jpg",
        parent: { kind: "soilProfile", soilProfileId: perfilDeBId },
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(LandMediaValidationError);
  });

  it("no deja colgar una foto del lote de biochar de otro bloque", async () => {
    await expect(
      finalizeLandAssetUpload(userAId, {
        locationId: locationAId,
        storageKey: `nectar-originals/land/${locationAId}/${RUN_ID}-cruzada2.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100,
        originalFilename: "cruzada2.jpg",
        parent: { kind: "biocharBatch", biocharBatchId: loteDeBId },
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(LandMediaValidationError);
  });

  it("sí deja colgarla del perfil de su propio bloque", async () => {
    const asset = await finalizeLandAssetUpload(userBId, {
      locationId: locationBId,
      storageKey: `nectar-originals/land/${locationBId}/${RUN_ID}-perfil.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 4096,
      originalFilename: "perfil.jpg",
      parent: { kind: "soilProfile", soilProfileId: perfilDeBId },
      provenanceClass: "direct_observation",
    });
    assetIds.push(asset.id);
    expect(asset.soilProfileId).toBe(perfilDeBId);
    // El ámbito viaja siempre, sea cual sea el padre: es por donde se lista.
    expect(asset.locationId).toBe(locationBId);
  });

  it("un padre inexistente no se confunde con uno ajeno", async () => {
    await expect(
      finalizeLandAssetUpload(userAId, {
        locationId: locationAId,
        storageKey: `nectar-originals/land/${locationAId}/${RUN_ID}-fantasma.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100,
        originalFilename: "fantasma.jpg",
        parent: { kind: "soilProfile", soilProfileId: "00000000-0000-0000-0000-000000000000" },
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(LocationAccessError);
  });
});

describe("listLandAssets", () => {
  it("rechaza un bloque ajeno", async () => {
    // El camino feliz pide URL firmadas a R2 y no se puede ejercitar sin
    // credenciales; el rechazo corre antes de tocar el almacenamiento.
    await expect(listLandAssets(userAId, locationBId)).rejects.toThrow(LocationAccessError);
  });
});
