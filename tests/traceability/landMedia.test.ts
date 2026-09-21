/**
 * S1 (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2). Fotografía con
 * ámbito de Location.
 *
 * **Lo que este archivo NO puede probar, y se dice:** el camino feliz de
 * `requestLandAssetUpload` llama al adaptador real de R2 (`putObject`), y no
 * hay credenciales en ningún entorno de prueba. Igual que `media.test.ts`, se
 * prueba todo lo que corre ANTES de esa llamada (RBAC) y todo
 * `finalizeLandAssetUpload`, que no toca el almacenamiento. `listLandAssets`
 * pide URL firmadas: donde importa QUÉ se firma, se espía
 * `objectStorageProvider.getSignedUrl` en vez de depender de que falten las
 * credenciales de R2 (en este Mac están, en CI no).
 *
 * El test que más importa está en el último describe: que el padre pertenezca
 * a la Location contra la que se autoriza. Sin él, quien tiene acceso al bloque
 * A puede colgar una foto del perfil del bloque B.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/db";
import { objectStorageProvider } from "../../lib/integrations/storage";
import { LocationAccessError } from "../../lib/traceability/locations";
import {
  finalizeLandAssetUpload,
  finalizeTrampaPhotoPorBorrador,
  requestTrampaPhotoUpload,
  claveDeFotoDeTrampa,
  LandMediaValidationError,
  listLandAssets,
  requestLandAssetUpload,
} from "../../lib/traceability/landMedia";
import { createSoilProfile } from "../../lib/traceability/soilProfiles";
import { createBiocharBatch } from "../../lib/traceability/biocharBatches";
import { createTrap, recordTrapCheck, TrapAccessError } from "../../lib/traceability/traps";
import { crearUsuarioConAcceso, crearUsuarioSinAcceso, crearParcela } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

/** Un Farm Operator de ESA parcela, con una concesión suya denegada a propósito
 * (o ninguna) — mismo mecanismo que la prueba "rechaza colgar la foto de una
 * revisión sin `specimen:manage`" de más abajo, factorizado para las pruebas
 * de la Tarea 12 (ruling P2 del controlador), que necesitan tres combinaciones
 * distintas de las dos concesiones del perfil. */
async function crearOperadorDeParcela(
  locationId: string,
  // A8 fix-final — un solo objeto sigue funcionando (los tres llamadores de
  // la Tarea 12 no cambian); un ARRAY es lo que necesita A8 para negar
  // `specimen:view` Y `specimen:manage` a la vez, porque `listLandAssets`
  // ahora acepta cualquiera de los dos.
  denegar?: { resourceType: string; action: string } | { resourceType: string; action: string }[],
) {
  const persona = await prisma.person.create({
    data: {
      givenName: "TEST",
      familyName: "P2",
      displayName: `TEST P2 (land-media-${Date.now()}-${crypto.randomUUID()})`,
      locale: "es",
    },
  });
  const cuenta = await prisma.userAccount.create({
    data: { personId: persona.id, authProvider: "credentials", status: "active" },
  });
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  // `Scope` es único por (scopeType, scopeRefId): dos operadores de LA MISMA
  // parcela (los tres casos de este describe la comparten, con distintas
  // concesiones denegadas) tienen que compartir una sola fila de `Scope`, no
  // crear una cada uno — de ahí el `upsert` en vez de `create`.
  const scope = await prisma.scope.upsert({
    where: { scopeType_scopeRefId: { scopeType: "location", scopeRefId: locationId } },
    update: {},
    create: { scopeType: "location", scopeRefId: locationId },
  });
  const assignment = await prisma.assignment.create({
    data: { userAccountId: cuenta.id, roleProfileId: perfil.id, scopeId: scope.id },
  });
  if (denegar) {
    for (const uno of Array.isArray(denegar) ? denegar : [denegar]) {
      const permiso = await prisma.permission.findFirstOrThrow({ where: uno });
      await prisma.assignmentPermissionOverride.create({
        data: { assignmentId: assignment.id, permissionId: permiso.id, effect: "deny" },
      });
    }
  }
  return { userAccountId: cuenta.id, personId: persona.id, scopeId: scope.id };
}

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

  // Comprueba que quedó auditada, no la atomicidad — cuando nada falla las dos
  // filas existen igual aunque el audit vaya por su cuenta. Eso lo cubre
  // `tests/arquitectura/audit-atomico.test.ts`, leyendo la fuente.
  it("deja el AuditEvent de la operación", async () => {
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

/**
 * A8 fix-final (M1), ruling del controlador. Sin `specimen:view`/`manage`,
 * las filas con `specimenObservationId` se filtran ANTES de pedir ninguna
 * URL firmada — por eso se puede comprobar el camino feliz de este caso sin
 * credenciales de R2: con la única foto de la parcela filtrada, la lista
 * queda vacía y `Promise.all([].map(...))` no llama a nada.
 *
 * El caso CON permiso no puede afirmar el contenido de la lista sin
 * credenciales (`getSignedUrl` también las exige), pero SÍ puede afirmar que
 * lo intentó: si tirara, es porque llegó a firmar — la prueba de que no se
 * filtró. Es el mismo patrón que ya usa este archivo para
 * `requestTrampaPhotoUpload` sin credenciales.
 */
describe("listLandAssets: la foto de revisión de trampa exige specimen:view/manage (A8)", () => {
  const userAccountIds: string[] = [];
  const personIds: string[] = [];
  const scopeIds: string[] = [];
  const locationIds: string[] = [];
  const organizationIds: string[] = [];
  const assetIdsLocal: string[] = [];

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
    await prisma.asset.deleteMany({ where: assertDefinedWhere({ id: { in: assetIdsLocal } }) });
    await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimen: { locationId: { in: locationIds } } }) });
    await prisma.specimen.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
    await prisma.assignmentPermissionOverride.deleteMany({
      where: assertDefinedWhere({ assignment: { userAccountId: { in: userAccountIds } } }),
    });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizationIds } }) });
  });

  async function fincaConFotoDeRevision() {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const dueno = await crearUsuarioConAcceso();
    userAccountIds.push(dueno.userAccountId);
    personIds.push(dueno.personId);
    scopeIds.push(dueno.scopeId);

    const trampa = await createTrap(dueno.userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revision = await recordTrapCheck(dueno.userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation", clientDraftId: crypto.randomUUID(),
    });
    const storageKey = claveDeFotoDeTrampa(parcela.id, crypto.randomUUID(), "tela.jpg");
    const asset = await finalizeTrampaPhotoPorBorrador(dueno.userAccountId, {
      locationId: parcela.id, storageKey, mimeType: "image/jpeg", sizeBytes: 1024,
      originalFilename: "tela.jpg", revisionClientDraftId: revision.clientDraftId!, provenanceClass: "direct_observation",
    });
    assetIdsLocal.push(asset.id);
    return parcela;
  }

  it("sin specimen:view NI specimen:manage, la lista sale vacía — no se firma nada", async () => {
    const parcela = await fincaConFotoDeRevision();

    const sinTrampas = await crearOperadorDeParcela(parcela.id, [
      { resourceType: "specimen", action: "view" },
      { resourceType: "specimen", action: "manage" },
    ]);
    userAccountIds.push(sinTrampas.userAccountId);
    personIds.push(sinTrampas.personId);
    scopeIds.push(sinTrampas.scopeId);

    const lista = await listLandAssets(sinTrampas.userAccountId, parcela.id);
    expect(lista).toEqual([]);
  });

  it("con specimen:view (sin manage), SÍ intenta incluirla — llega a pedir la URL", async () => {
    const parcela = await fincaConFotoDeRevision();

    const soloVer = await crearOperadorDeParcela(parcela.id, { resourceType: "specimen", action: "manage" });
    userAccountIds.push(soloVer.userAccountId);
    personIds.push(soloVer.personId);
    scopeIds.push(soloVer.scopeId);

    // El caso anterior demuestra que sin NINGÚN permiso de trampas la lista
    // sale vacía sin tocar el proveedor. Aquí se espía el firmador: que se le
    // pida la URL de ESTA foto es la prueba de que la fila pasó el filtro.
    // Antes se esperaba un rechazo «por falta de credenciales de R2», que
    // medía el entorno: con las credenciales presentes la llamada no fallaba
    // y la prueba caía sin que el código cambiara.
    const foto = await prisma.asset.findFirstOrThrow({
      where: { locationId: parcela.id, specimenObservationId: { not: null } },
      select: { id: true, storageKey: true },
    });
    const firmar = vi
      .spyOn(objectStorageProvider, "getSignedUrl")
      .mockImplementation(async (key) => `https://firmada.test/${key}`);
    try {
      const lista = await listLandAssets(soloVer.userAccountId, parcela.id);
      expect(firmar).toHaveBeenCalledWith(foto.storageKey);
      expect(lista.map((a) => [a.id, a.url])).toEqual([[foto.id, `https://firmada.test/${foto.storageKey}`]]);
    } finally {
      firmar.mockRestore();
    }
  });
});

// F2 §4 (Tarea 5) — una foto de la tela de una trampa cuelga de la REVISIÓN
// (SpecimenObservation, `observationType: "trap_check"`), no de la trampa
// entera (Specimen). Setup propio, ajeno al `beforeAll`/`afterAll` de arriba
// (que son del bloque A/B de biochar y suelo): usa `crearUsuarioConAcceso` +
// `crearParcela`, el mismo patrón que `tests/traceability/traps.test.ts`.
describe("la foto de una revisión de trampa", () => {
  const userAccountIds: string[] = [];
  const personIds: string[] = [];
  const scopeIds: string[] = [];
  const locationIds: string[] = [];
  const organizationIds: string[] = [];
  const assetIdsLocal: string[] = [];

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
    await prisma.asset.deleteMany({ where: assertDefinedWhere({ id: { in: assetIdsLocal } }) });
    await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimen: { locationId: { in: locationIds } } }) });
    await prisma.specimen.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizationIds } }) });
  });

  it("cuelga la foto de la revisión, no de la trampa", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation",
    });
    // `requestLandAssetUpload` no se ejercita aquí: su camino feliz llama al
    // adaptador real de R2 y no hay credenciales en ningún entorno de prueba
    // (ver el comentario de cabecera de este archivo) — mismo motivo por el
    // que el resto de pruebas de este archivo construyen la clave a mano.
    const asset = await finalizeLandAssetUpload(userAccountId, {
      locationId: parcela.id,
      storageKey: `nectar-originals/land/${parcela.id}/${RUN_ID}-tela.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 1234,
      originalFilename: "tela.jpg",
      parent: { kind: "trapCheck", specimenObservationId: revision.id },
      provenanceClass: "direct_observation",
    });
    assetIdsLocal.push(asset.id);
    expect(asset.specimenObservationId).toBe(revision.id);
  });

  // El agujero, igual que con el perfil de suelo y el lote de biochar: la
  // Location que se autoriza (parcela A) y el padre (una revisión de la
  // parcela B) pueden no coincidir. Sin la comprobación, alguien con acceso
  // a A podría colgar ahí la foto de una revisión de B.
  it("rechaza colgar la foto de una revisión de otra parcela", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcelaA = await crearParcela();
    locationIds.push(parcelaA.id, parcelaA.parentLocationId!);
    organizationIds.push(parcelaA.organizationId!);
    const parcelaB = await crearParcela();
    locationIds.push(parcelaB.id, parcelaB.parentLocationId!);
    organizationIds.push(parcelaB.organizationId!);

    const trampaB = await createTrap(userAccountId, {
      locationId: parcelaB.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revisionB = await recordTrapCheck(userAccountId, {
      specimenId: trampaB.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation",
    });
    await expect(
      finalizeLandAssetUpload(userAccountId, {
        locationId: parcelaA.id,
        storageKey: `nectar-originals/land/${parcelaA.id}/${RUN_ID}-cruzada-trampa.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 1234,
        originalFilename: "cruzada.jpg",
        parent: { kind: "trapCheck", specimenObservationId: revisionB.id },
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(LandMediaValidationError);
  });

  // F5 fix-final — antes esta vía sólo exigía `location:manage_attributes`
  // (la primera línea de `finalizeLandAssetUpload`). Alguien con la parcela
  // pero sin `specimen:manage` podía colgar evidencia en una revisión que ni
  // siquiera podía crear. Mismo mecanismo de `deny` que
  // `tests/rbac/ajustesDePermiso.test.ts`, para probar el guardia nuevo con
  // acceso real a la parcela y no con la ausencia total de asignación.
  it("rechaza colgar la foto de una revisión sin `specimen:manage`", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation",
    });

    const assignment = await prisma.assignment.findFirstOrThrow({ where: { userAccountId } });
    const permisoSpecimenManage = await prisma.permission.findFirstOrThrow({
      where: { resourceType: "specimen", action: "manage" },
    });
    await prisma.assignmentPermissionOverride.create({
      data: { assignmentId: assignment.id, permissionId: permisoSpecimenManage.id, effect: "deny" },
    });

    await expect(
      finalizeLandAssetUpload(userAccountId, {
        locationId: parcela.id,
        storageKey: `nectar-originals/land/${parcela.id}/${RUN_ID}-sin-permiso.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 1234,
        originalFilename: "sin-permiso.jpg",
        parent: { kind: "trapCheck", specimenObservationId: revision.id },
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TrapAccessError);
  });
});

// Tarea 12 — la foto de la ronda viaja sin señal y se engancha por el
// `clientDraftId` de SU revisión (spec §4.3), nunca por el
// `specimenObservationId` real: la revisión puede no haber llegado todavía
// (Tarea 11, su propia cola). `finalizeTrampaPhotoPorBorrador` es la mitad
// server de ese enganche; `requestTrampaPhotoUpload` es el paso 1, la URL
// firmada.
describe("finalizeTrampaPhotoPorBorrador: engancha por clientDraftId, nunca a otra revisión", () => {
  const userAccountIds: string[] = [];
  const personIds: string[] = [];
  const scopeIds: string[] = [];
  const locationIds: string[] = [];
  const organizationIds: string[] = [];
  const assetIdsLocal: string[] = [];

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
    await prisma.asset.deleteMany({ where: assertDefinedWhere({ id: { in: assetIdsLocal } }) });
    await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimen: { locationId: { in: locationIds } } }) });
    await prisma.specimen.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizationIds } }) });
  });

  it("resuelve la revisión por clientDraftId y cuelga el Asset de ella", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const clientDraftId = crypto.randomUUID();
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation", clientDraftId,
    });

    const asset = await finalizeTrampaPhotoPorBorrador(userAccountId, {
      locationId: parcela.id,
      storageKey: `nectar-originals/land/${parcela.id}/${Date.now()}-t12-tela.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      originalFilename: "tela.jpg",
      revisionClientDraftId: clientDraftId,
      provenanceClass: "direct_observation",
    });
    assetIdsLocal.push(asset.id);
    expect(asset.specimenObservationId).toBe(revision.id);
  });

  it("si la revisión no ha llegado, lanza revision_not_found_yet (no un rechazo definitivo)", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await expect(
      finalizeTrampaPhotoPorBorrador(userAccountId, {
        locationId: parcela.id,
        storageKey: `nectar-originals/land/${parcela.id}/${Date.now()}-t12-huerfana.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        originalFilename: "tela.jpg",
        revisionClientDraftId: "no-existe-todavia",
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(/revision_not_found_yet/);
  });

  it("deniega sin acceso de specimen a la parcela (la revisión que no puede alcanzar)", async () => {
    const dueno = await crearUsuarioConAcceso();
    userAccountIds.push(dueno.userAccountId);
    personIds.push(dueno.personId);
    scopeIds.push(dueno.scopeId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(dueno.userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const clientDraftId = crypto.randomUUID();
    await recordTrapCheck(dueno.userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation", clientDraftId,
    });

    const ajeno = await crearUsuarioSinAcceso();
    userAccountIds.push(ajeno.userAccountId);
    personIds.push(ajeno.personId);
    scopeIds.push(ajeno.scopeId);
    locationIds.push(ajeno.locationId);
    organizationIds.push(ajeno.organizationId);

    await expect(
      finalizeTrampaPhotoPorBorrador(ajeno.userAccountId, {
        locationId: parcela.id,
        storageKey: `nectar-originals/land/${parcela.id}/${Date.now()}-t12-ajeno.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        originalFilename: "tela.jpg",
        revisionClientDraftId: clientDraftId,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TrapAccessError);
  });

  // El mismo agujero que "el padre tiene que ser de ESE bloque", más arriba,
  // pero por `clientDraftId`: quien tiene acceso a la parcela A no puede
  // enganchar su foto a una revisión de la parcela B mandando A como ámbito.
  // La comprobación es la MISMA foto en dos filas de `LandMediaValidationError`
  // — `exigirPadreDeEsaLocation` no se reutiliza aquí porque exige un
  // `specimenObservationId` real, así que la resuelve directamente
  // `finalizeTrampaPhotoPorBorrador`.
  it("no engancha la foto a una revisión de otra parcela, aunque tenga acceso a la suya", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcelaA = await crearParcela();
    locationIds.push(parcelaA.id, parcelaA.parentLocationId!);
    organizationIds.push(parcelaA.organizationId!);
    const parcelaB = await crearParcela();
    locationIds.push(parcelaB.id, parcelaB.parentLocationId!);
    organizationIds.push(parcelaB.organizationId!);

    const trampaB = await createTrap(userAccountId, {
      locationId: parcelaB.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const clientDraftId = crypto.randomUUID();
    await recordTrapCheck(userAccountId, {
      specimenId: trampaB.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation", clientDraftId,
    });

    await expect(
      finalizeTrampaPhotoPorBorrador(userAccountId, {
        locationId: parcelaA.id,
        storageKey: `nectar-originals/land/${parcelaA.id}/${Date.now()}-t12-cruzada.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        originalFilename: "cruzada.jpg",
        revisionClientDraftId: clientDraftId,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(LandMediaValidationError);
  });
});

// Fix round 1 — la mitad pura de la idempotencia: la clave tiene que ser
// SIEMPRE la misma para la misma foto, nunca al azar. Sin base, sin permisos:
// es sólo formato de cadena. El flip-test que pide el ruling («volver a una
// clave al azar por intento») cae exactamente aquí, en el primer `it`.
describe("claveDeFotoDeTrampa: determinista por foto, no al azar (fix round 1)", () => {
  it("mismos locationId + photoClientDraftId + originalFilename dan SIEMPRE la misma clave", () => {
    const a = claveDeFotoDeTrampa("loc-1", "foto-abc", "tela.jpg");
    const b = claveDeFotoDeTrampa("loc-1", "foto-abc", "tela.jpg");
    expect(a).toBe(b);
  });

  it("una foto DISTINTA (otro clientDraftId) da una clave distinta", () => {
    const a = claveDeFotoDeTrampa("loc-1", "foto-abc", "tela.jpg");
    const b = claveDeFotoDeTrampa("loc-1", "foto-xyz", "tela.jpg");
    expect(a).not.toBe(b);
  });

  it("queda bajo el prefijo de ESA parcela", () => {
    const clave = claveDeFotoDeTrampa("loc-1", "foto-abc", "tela.jpg");
    expect(clave.startsWith("nectar-originals/land/loc-1/")).toBe(true);
  });
});

/**
 * A5 fix-final (I6), ruling del controlador — la autoría de la foto de la
 * ronda ya no acepta ningún `creatorPersonId` del llamador: siempre la
 * persona de la cuenta de sesión. TypeScript ya lo impide en tiempo de
 * compilación (el campo salió de `FinalizeTrampaPhotoInput`); esta prueba
 * comprueba además el comportamiento en TIEMPO DE EJECUCIÓN, forzando el
 * campo con un `as never` — exactamente como llegaría desde un cliente que
 * no pasa por el tipo (una llamada RPC directa a la Server Action, o un
 * `fetch` a mano).
 */
describe("finalizeTrampaPhotoPorBorrador: la autoría es SIEMPRE la de la sesión (A5)", () => {
  const userAccountIds: string[] = [];
  const personIds: string[] = [];
  const scopeIds: string[] = [];
  const locationIds: string[] = [];
  const organizationIds: string[] = [];
  const assetIdsLocal: string[] = [];

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
    await prisma.asset.deleteMany({ where: assertDefinedWhere({ id: { in: assetIdsLocal } }) });
    await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimen: { locationId: { in: locationIds } } }) });
    await prisma.specimen.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizationIds } }) });
  });

  it("un creatorPersonId forjado (fuera del tipo) se ignora: queda la persona de la sesión", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation", clientDraftId: crypto.randomUUID(),
    });

    const otraPersona = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Foto forjada", displayName: `TEST Foto forjada (${RUN_ID})`, locale: "es" },
    });
    personIds.push(otraPersona.id);

    const storageKey = claveDeFotoDeTrampa(parcela.id, crypto.randomUUID(), "tela.jpg");
    const asset = await finalizeTrampaPhotoPorBorrador(userAccountId, {
      locationId: parcela.id,
      storageKey,
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      originalFilename: "tela.jpg",
      revisionClientDraftId: revision.clientDraftId!,
      provenanceClass: "direct_observation",
      // No existe en `FinalizeTrampaPhotoInput`: viaja igual, como lo haría
      // un payload hostil que el tipo no puede impedir en tiempo de ejecución.
      ...({ creatorPersonId: otraPersona.id } as Record<string, unknown>),
    } as never);
    assetIdsLocal.push(asset.id);

    expect(asset.creatorPersonId).toBe(usuario.personId);
    expect(asset.creatorPersonId).not.toBe(otraPersona.id);
  });
});

/**
 * A6 fix-final (I2), ruling del controlador — antes de firmar el PUT,
 * `requestTrampaPhotoUpload` comprueba si la `storageKey` derivada ya tiene
 * un `Asset`. Sólo se firma de nuevo cuando es de la MISMA revisión (el
 * reintento legítimo); si es de otra, se rechaza SIN firmar — antes de este
 * arreglo, el PUT se firmaba siempre y la comprobación de pertenencia sólo
 * llegaba después, en `finalizeTrampaPhotoPorBorrador`, cuando los bytes del
 * bucket ya se habían sobrescrito.
 */
describe("requestTrampaPhotoUpload: la clave ya usada por OTRA revisión se rechaza antes de firmar (A6)", () => {
  const userAccountIds: string[] = [];
  const personIds: string[] = [];
  const scopeIds: string[] = [];
  const locationIds: string[] = [];
  const organizationIds: string[] = [];
  const assetIdsLocal: string[] = [];

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
    await prisma.asset.deleteMany({ where: assertDefinedWhere({ id: { in: assetIdsLocal } }) });
    await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimen: { locationId: { in: locationIds } } }) });
    await prisma.specimen.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizationIds } }) });
  });

  it("una storageKey ya finalizada bajo OTRA revisión rechaza la petición de URL", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampaA = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const trampaB = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revisionA = await recordTrapCheck(userAccountId, {
      specimenId: trampaA.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation", clientDraftId: crypto.randomUUID(),
    });
    const revisionB = await recordTrapCheck(userAccountId, {
      specimenId: trampaB.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation", clientDraftId: crypto.randomUUID(),
    });

    // La foto de A ya se finalizó bajo su propia clave.
    const photoClientDraftId = crypto.randomUUID();
    const storageKey = claveDeFotoDeTrampa(parcela.id, photoClientDraftId, "tela.jpg");
    const assetDeA = await finalizeTrampaPhotoPorBorrador(userAccountId, {
      locationId: parcela.id, storageKey, mimeType: "image/jpeg", sizeBytes: 1024,
      originalFilename: "tela.jpg", revisionClientDraftId: revisionA.clientDraftId!, provenanceClass: "direct_observation",
    });
    assetIdsLocal.push(assetDeA.id);

    // Alguien reutiliza el MISMO photoClientDraftId, pero declarando que es
    // para la revisión B: `requestTrampaPhotoUpload` deriva la MISMA clave
    // (determinista) y tiene que rechazar antes de firmar el PUT.
    await expect(
      requestTrampaPhotoUpload(userAccountId, {
        locationId: parcela.id, originalFilename: "tela.jpg", contentType: "image/jpeg",
        photoClientDraftId, revisionClientDraftId: revisionB.clientDraftId!,
      }),
    ).rejects.toThrow(LandMediaValidationError);

    // Control: el Asset de A sigue intacto, con SU revisión.
    const intacto = await prisma.asset.findUniqueOrThrow({ where: { storageKey } });
    expect(intacto.specimenObservationId).toBe(revisionA.id);
    expect(intacto.specimenObservationId).not.toBe(revisionB.id);
  });

  it("la MISMA revisión reintentando su propia foto SÍ recibe una URL (no se rechaza)", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation", clientDraftId: crypto.randomUUID(),
    });

    const photoClientDraftId = crypto.randomUUID();
    const storageKey = claveDeFotoDeTrampa(parcela.id, photoClientDraftId, "tela.jpg");
    const asset = await finalizeTrampaPhotoPorBorrador(userAccountId, {
      locationId: parcela.id, storageKey, mimeType: "image/jpeg", sizeBytes: 1024,
      originalFilename: "tela.jpg", revisionClientDraftId: revision.clientDraftId!, provenanceClass: "direct_observation",
    });
    assetIdsLocal.push(asset.id);

    // El acuse se perdió: el cliente vuelve a pedir la URL para la MISMA foto,
    // de la MISMA revisión. No debe rechazarse.
    let rechazado = false;
    try {
      await requestTrampaPhotoUpload(userAccountId, {
        locationId: parcela.id, originalFilename: "tela.jpg", contentType: "image/jpeg",
        photoClientDraftId, revisionClientDraftId: revision.clientDraftId!,
      });
    } catch (error) {
      rechazado = error instanceof LandMediaValidationError;
    }
    expect(rechazado).toBe(false);
  });
});

// Fix round 1 (Tarea 12), ruling del controlador — un reintento con acuse
// perdido no puede duplicar el `Asset`. La clave la deriva
// `claveDeFotoDeTrampa` (en `landMedia.ts`) del `clientDraftId` de la FOTO
// misma, así que aquí se construye a mano —igual que hace
// `requestTrampaPhotoUpload` internamente— para simular exactamente el
// reintento: la misma llamada, dos veces, con la misma clave.
describe("finalizeTrampaPhotoPorBorrador es idempotente por storageKey (fix round 1)", () => {
  const userAccountIds: string[] = [];
  const personIds: string[] = [];
  const scopeIds: string[] = [];
  const locationIds: string[] = [];
  const organizationIds: string[] = [];
  const assetIdsLocal: string[] = [];

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
    await prisma.asset.deleteMany({ where: assertDefinedWhere({ id: { in: assetIdsLocal } }) });
    await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimen: { locationId: { in: locationIds } } }) });
    await prisma.specimen.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizationIds } }) });
  });

  it("finalizar la misma foto dos veces deja exactamente UN Asset, y la segunda también sale bien", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revisionClientDraftId = crypto.randomUUID();
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation", clientDraftId: revisionClientDraftId,
    });

    // La misma clave que `requestTrampaPhotoUpload` calcularía para esta
    // foto — se repite a propósito en las dos llamadas, simulando el
    // reintento con la URL YA pedida (o vuelta a pedir: la clave es la misma).
    const photoClientDraftId = crypto.randomUUID();
    const storageKey = `nectar-originals/land/${parcela.id}/foto-${photoClientDraftId}.jpg`;

    const primero = await finalizeTrampaPhotoPorBorrador(userAccountId, {
      locationId: parcela.id, storageKey, mimeType: "image/jpeg", sizeBytes: 1024,
      originalFilename: "tela.jpg", revisionClientDraftId, provenanceClass: "direct_observation",
    });
    assetIdsLocal.push(primero.id);

    const segundo = await finalizeTrampaPhotoPorBorrador(userAccountId, {
      locationId: parcela.id, storageKey, mimeType: "image/jpeg", sizeBytes: 1024,
      originalFilename: "tela.jpg", revisionClientDraftId, provenanceClass: "direct_observation",
    });

    // La aserción que importa: CONTAR, no sólo comprobar que no lanzó.
    expect(segundo.id).toBe(primero.id);
    const filas = await prisma.asset.count({ where: { storageKey } });
    expect(filas).toBe(1);
    expect(primero.specimenObservationId).toBe(revision.id);
  });

  it("una foto DISTINTA de la misma revisión crea su propia fila", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revisionClientDraftId = crypto.randomUUID();
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation", clientDraftId: revisionClientDraftId,
    });

    const claveA = `nectar-originals/land/${parcela.id}/foto-${crypto.randomUUID()}.jpg`;
    const claveB = `nectar-originals/land/${parcela.id}/foto-${crypto.randomUUID()}.jpg`;

    const assetA = await finalizeTrampaPhotoPorBorrador(userAccountId, {
      locationId: parcela.id, storageKey: claveA, mimeType: "image/jpeg", sizeBytes: 1024,
      originalFilename: "tela-a.jpg", revisionClientDraftId, provenanceClass: "direct_observation",
    });
    assetIdsLocal.push(assetA.id);
    const assetB = await finalizeTrampaPhotoPorBorrador(userAccountId, {
      locationId: parcela.id, storageKey: claveB, mimeType: "image/jpeg", sizeBytes: 1024,
      originalFilename: "tela-b.jpg", revisionClientDraftId, provenanceClass: "direct_observation",
    });
    assetIdsLocal.push(assetB.id);

    expect(assetA.id).not.toBe(assetB.id);
    expect(assetA.specimenObservationId).toBe(revision.id);
    expect(assetB.specimenObservationId).toBe(revision.id);
    const filas = await prisma.asset.count({
      where: { specimenObservationId: revision.id },
    });
    expect(filas).toBe(2);
  });
});

// Ruling P2 del controlador (Tarea 12) — la foto de una revisión de trampa se
// autoriza con `requireTrapAccess` (specimen:manage), nunca con
// `location:manage_attributes`. `crearOperadorDeParcela` (arriba) da un Farm
// Operator con una de las dos concesiones quitada a propósito, para poner las
// tres combinaciones que pide el ruling: sólo trampa, ninguna, y sólo
// atributos.
describe("permiso de la foto de trampa: TRAP, no location:manage_attributes (ruling P2)", () => {
  const userAccountIds: string[] = [];
  const personIds: string[] = [];
  const scopeIds: string[] = [];
  const locationIds: string[] = [];
  const organizationIds: string[] = [];
  const assetIdsLocal: string[] = [];

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
    await prisma.asset.deleteMany({ where: assertDefinedWhere({ id: { in: assetIdsLocal } }) });
    await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimen: { locationId: { in: locationIds } } }) });
    await prisma.specimen.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizationIds } }) });
  });

  it("sólo permiso de trampa, sin manage_attributes: la URL no la rechaza el acceso, y finaliza", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const operador = await crearOperadorDeParcela(parcela.id, { resourceType: "location", action: "manage_attributes" });
    userAccountIds.push(operador.userAccountId);
    personIds.push(operador.personId);
    scopeIds.push(operador.scopeId);

    const trampa = await createTrap(operador.userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const clientDraftId = crypto.randomUUID();
    const revision = await recordTrapCheck(operador.userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation", clientDraftId,
    });

    // El camino feliz de `requestTrampaPhotoUpload` llama al adaptador real de
    // R2 (`putObject`) y no hay credenciales en este entorno (ver la cabecera
    // de este archivo). Lo que SÍ se puede comprobar sin ellas es que la
    // compuerta de acceso no lo detiene: si rechazara, sería con
    // `TrapAccessError`, y eso es lo que se afirma que NO pasa.
    let rechazoDeAcceso = false;
    try {
      await requestTrampaPhotoUpload(operador.userAccountId, {
        locationId: parcela.id, originalFilename: "tela.jpg", contentType: "image/jpeg",
        photoClientDraftId: crypto.randomUUID(), revisionClientDraftId: clientDraftId,
      });
    } catch (error) {
      rechazoDeAcceso = error instanceof TrapAccessError;
    }
    expect(rechazoDeAcceso).toBe(false);

    const asset = await finalizeTrampaPhotoPorBorrador(operador.userAccountId, {
      locationId: parcela.id,
      storageKey: `nectar-originals/land/${parcela.id}/${Date.now()}-p2-solo-trampa.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      originalFilename: "tela.jpg",
      revisionClientDraftId: clientDraftId,
      provenanceClass: "direct_observation",
    });
    assetIdsLocal.push(asset.id);
    expect(asset.specimenObservationId).toBe(revision.id);
  });

  it("sin ningún permiso de trampa, se rechaza al pedir la URL y al finalizar", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const dueno = await crearOperadorDeParcela(parcela.id);
    userAccountIds.push(dueno.userAccountId);
    personIds.push(dueno.personId);
    scopeIds.push(dueno.scopeId);
    const trampa = await createTrap(dueno.userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const clientDraftId = crypto.randomUUID();
    await recordTrapCheck(dueno.userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation", clientDraftId,
    });

    const ajeno = await crearUsuarioSinAcceso();
    userAccountIds.push(ajeno.userAccountId);
    personIds.push(ajeno.personId);
    scopeIds.push(ajeno.scopeId);
    locationIds.push(ajeno.locationId);
    organizationIds.push(ajeno.organizationId);

    await expect(
      requestTrampaPhotoUpload(ajeno.userAccountId, {
        locationId: parcela.id, originalFilename: "tela.jpg", contentType: "image/jpeg",
        photoClientDraftId: crypto.randomUUID(), revisionClientDraftId: clientDraftId,
      }),
    ).rejects.toThrow(TrapAccessError);

    await expect(
      finalizeTrampaPhotoPorBorrador(ajeno.userAccountId, {
        locationId: parcela.id,
        storageKey: `nectar-originals/land/${parcela.id}/${Date.now()}-p2-sin-permiso.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        originalFilename: "y.jpg",
        revisionClientDraftId: clientDraftId,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TrapAccessError);
  });

  it("con manage_attributes pero sin permiso de trampa, también se rechaza para un padre de trampa", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const dueno = await crearOperadorDeParcela(parcela.id);
    userAccountIds.push(dueno.userAccountId);
    personIds.push(dueno.personId);
    scopeIds.push(dueno.scopeId);
    const trampa = await createTrap(dueno.userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const clientDraftId = crypto.randomUUID();
    await recordTrapCheck(dueno.userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation", clientDraftId,
    });

    const soloAtributos = await crearOperadorDeParcela(parcela.id, { resourceType: "specimen", action: "manage" });
    userAccountIds.push(soloAtributos.userAccountId);
    personIds.push(soloAtributos.personId);
    scopeIds.push(soloAtributos.scopeId);

    await expect(
      requestTrampaPhotoUpload(soloAtributos.userAccountId, {
        locationId: parcela.id, originalFilename: "tela.jpg", contentType: "image/jpeg",
        photoClientDraftId: crypto.randomUUID(), revisionClientDraftId: clientDraftId,
      }),
    ).rejects.toThrow(TrapAccessError);

    await expect(
      finalizeTrampaPhotoPorBorrador(soloAtributos.userAccountId, {
        locationId: parcela.id,
        storageKey: `nectar-originals/land/${parcela.id}/${Date.now()}-p2-solo-atributos.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        originalFilename: "z.jpg",
        revisionClientDraftId: clientDraftId,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TrapAccessError);
  });
});
