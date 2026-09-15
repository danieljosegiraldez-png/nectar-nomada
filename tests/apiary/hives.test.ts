/**
 * Ticket A1 (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md §3). Real
 * Postgres (Neon), no mocks — same discipline as every Traceability test
 * suite. DoD (A1 row): Location.locationType gains apiary_site, Hive/Colony
 * schema, apiary RBAC subject, service layer — no origin fields, no
 * Inspection, no ColonyEvent (those are A2).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { ApiaryAccessError, createColony, createHive, getHive } from "../../lib/apiary/hives";
import { apiarioDeColmenaEn } from "../../lib/apiary/traslado";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a1-${Date.now()}`;

let organizationId: string;
let projectAId: string;
let projectBId: string;
let apiarySiteId: string; // locationType = apiary_site, no projectId — location-scoped access only
let otherApiarySiteId: string;

let authorizedUserAccountId: string; // Farm Operator, scope: project A
let locationScopedUserAccountId: string; // Farm Operator, scope: apiarySiteId
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

async function assignFarmOperator(userAccountId: string, scope: { scopeType: "project" | "location"; scopeRefId: string }) {
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

  const otherApiarySite = await prisma.location.create({
    data: { locationType: "apiary_site", name: `TEST Other Apiary (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  otherApiarySiteId = otherApiarySite.id;

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

  locationScopedUserAccountId = await createTestUserAccount("LocationScopedOperator");
  await assignFarmOperator(locationScopedUserAccountId, { scopeType: "location", scopeRefId: apiarySiteId });

  wrongProjectUserAccountId = await createTestUserAccount("WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, { scopeType: "project", scopeRefId: projectBId });

  unauthorizedUserAccountId = await createTestUserAccount("Unauthorized");
});

afterAll(async () => {
  const testHives = await prisma.hive.findMany({ where: { identifier: { startsWith: RUN_ID } } });
  const hiveIds = testHives.map((h) => h.id);
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ hiveId: { in: hiveIds } }) });
  // La colocación es hija de la colmena y su FK es RESTRICT: sin esta línea el borrado
  // de abajo falla. `createHive` abre una desde el 2026-09-15 (ADR-135).
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { id: { in: hiveIds } } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: hiveIds } }) });
  // Los AuditEvent de `hive.create` son nuevos (ADR-135) y no los borraba nada.
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "hive", entityId: { in: hiveIds } }) });

  const userAccountIds = [authorizedUserAccountId, locationScopedUserAccountId, wrongProjectUserAccountId, unauthorizedUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({
    where: assertDefinedWhere({ OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }, { scopeRefId: apiarySiteId }] }),
  });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [apiarySiteId, otherApiarySiteId] } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectAId, projectBId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("Location.locationType — apiary_site", () => {
  it("was created successfully by beforeAll, round-tripping the new enum value", async () => {
    const reloaded = await prisma.location.findUniqueOrThrow({ where: { id: apiarySiteId } });
    expect(reloaded.locationType).toBe("apiary_site");
  });
});

describe("createHive", () => {
  it("creates a Hive for a project-scoped Farm Operator, status defaulting to active", async () => {
    const hive = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-001`,
      locationId: apiarySiteId,
      projectId: projectAId,
    });

    expect(hive.identifier).toBe(`${RUN_ID}-H-001`);
    expect(hive.locationId).toBe(apiarySiteId);
    expect(hive.status).toBe("active");
    expect(hive.installedAt).toBeNull();
  });

  it("creates a Hive for a Farm Operator scoped to the apiary_site Location directly, with no projectId at all", async () => {
    const hive = await createHive(locationScopedUserAccountId, {
      identifier: `${RUN_ID}-H-002`,
      locationId: apiarySiteId,
    });

    expect(hive.projectId).toBeNull();
    expect(hive.locationId).toBe(apiarySiteId);
  });

  it("denies a Farm Operator scoped to a different project and a different location", async () => {
    await expect(
      createHive(wrongProjectUserAccountId, { identifier: `${RUN_ID}-H-003`, locationId: apiarySiteId }),
    ).rejects.toThrow(ApiaryAccessError);
  });

  it("denies a user with no Assignment at all", async () => {
    await expect(
      createHive(unauthorizedUserAccountId, { identifier: `${RUN_ID}-H-004`, locationId: apiarySiteId, projectId: projectAId }),
    ).rejects.toThrow(ApiaryAccessError);
  });
});

/**
 * ADR-135 — una colmena nace con su colocación, y con su rastro.
 *
 * **Lo que esto habría cazado.** ADR-126 dejó la invariante en un comentario, y medido el
 * 2026-09-15 sobre la copia local con los datos reales: **10 de 29 colmenas sin ninguna
 * colocación**, las diez de Apiario Las Nubes. `apiarioDeColmenaEn` devolvía `null` para
 * todas —«no consta»— y el §9 del Anexo E era ciego al apiario real del dueño. Nada fallaba
 * en rojo.
 */
describe("createHive abre la colocación inicial", () => {
  it("deja UNA colocación abierta, en la ubicación de la colmena", async () => {
    const hive = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-010`,
      locationId: apiarySiteId,
      projectId: projectAId,
    });

    const colocaciones = await prisma.hivePlacement.findMany({ where: { hiveId: hive.id } });
    expect(colocaciones).toHaveLength(1);
    expect(colocaciones[0]!.locationId).toBe(apiarySiteId);
    expect(colocaciones[0]!.endedAt, "abierta: es la vigente").toBeNull();
    // `reason` queda null: ninguno de los cuatro motivos del Anexo describe «aquí nació».
    expect(colocaciones[0]!.reason).toBeNull();
    expect(colocaciones[0]!.createdBy).toBe(authorizedUserAccountId);
  });

  it("LA AFIRMACIÓN: los lectores por fecha la ven desde el primer segundo", async () => {
    // Es la prueba que importa, porque es la que fallaba: sin colocación,
    // `apiarioDeColmenaEn` contesta `null` y `colmenasDeLaVentana` no la cuenta.
    const hive = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-011`,
      locationId: apiarySiteId,
      projectId: projectAId,
      installedAt: new Date("2026-09-02T11:00:00Z"),
    });

    expect(await apiarioDeColmenaEn(hive.id, new Date("2026-09-10T00:00:00Z"))).toBe(apiarySiteId);
    // Y el intervalo es semiabierto de verdad: antes de instalarse, no consta.
    expect(await apiarioDeColmenaEn(hive.id, new Date("2026-09-01T00:00:00Z"))).toBeNull();
  });

  it("la fecha sale de `installedAt` cuando la hay, y de `createdAt` cuando no", async () => {
    // La misma regla que el relleno de ADR-126: `COALESCE(installed_at, created_at)`.
    const declarada = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-012`,
      locationId: apiarySiteId,
      projectId: projectAId,
      installedAt: new Date("2026-08-24T06:00:00Z"),
    });
    const conDeclarada = await prisma.hivePlacement.findFirstOrThrow({ where: { hiveId: declarada.id } });
    expect(conDeclarada.startedAt).toEqual(new Date("2026-08-24T06:00:00Z"));

    const sinDeclarar = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-013`,
      locationId: apiarySiteId,
      projectId: projectAId,
    });
    const sinDeclarada = await prisma.hivePlacement.findFirstOrThrow({ where: { hiveId: sinDeclarar.id } });
    expect(sinDeclarada.startedAt).toEqual(sinDeclarar.createdAt);
    // Control de que las dos ramas se distinguen: no son la misma fecha.
    expect(sinDeclarada.startedAt).not.toEqual(conDeclarada.startedAt);
  });

  it("y escribe su AuditEvent, que el camino de la aplicación no escribía", async () => {
    const hive = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-014`,
      locationId: apiarySiteId,
      projectId: projectAId,
    });

    const eventos = await prisma.auditEvent.findMany({
      where: { entityType: "hive", entityId: hive.id },
      select: { operation: true, actorUserAccountId: true, sourceInterface: true },
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.operation).toBe("hive.create");
    expect(eventos[0]!.actorUserAccountId).toBe(authorizedUserAccountId);
    expect(eventos[0]!.sourceInterface).toBe("web");
  });

  it("y si algo falla, no queda ni la colmena ni su colocación: es una transacción", async () => {
    // El identificador es único por ubicación (`hive_location_id_identifier_key`), así que
    // repetirlo revienta DENTRO de la transacción. Lo que se comprueba es que el primer
    // `create` no sobrevive al fallo del segundo paso — la mitad que haría falsa la
    // invariante entera.
    const identifier = `${RUN_ID}-H-015`;
    await createHive(authorizedUserAccountId, { identifier, locationId: apiarySiteId, projectId: projectAId });
    const antes = await prisma.hive.count({ where: { locationId: apiarySiteId, identifier } });
    await expect(
      createHive(authorizedUserAccountId, { identifier, locationId: apiarySiteId, projectId: projectAId }),
    ).rejects.toThrow();
    expect(await prisma.hive.count({ where: { locationId: apiarySiteId, identifier } })).toBe(antes);
    const colmena = await prisma.hive.findFirstOrThrow({ where: { locationId: apiarySiteId, identifier } });
    expect(await prisma.hivePlacement.count({ where: { hiveId: colmena.id } })).toBe(1);
  });
});

describe("createColony", () => {
  it("creates a Colony under an existing Hive, provenanceClass persisted verbatim, dataQuality null by default", async () => {
    const hive = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-005`,
      locationId: apiarySiteId,
      projectId: projectAId,
    });

    const colony = await createColony(authorizedUserAccountId, {
      hiveId: hive.id,
      startedAt: new Date("2026-01-01"),
      originType: "purchased",
      provenanceClass: "direct_observation",
    });

    expect(colony.hiveId).toBe(hive.id);
    expect(colony.status).toBe("active");
    expect(colony.provenanceClass).toBe("direct_observation");
    expect(colony.dataQuality).toBeNull();
  });

  it("resolves RBAC via the parent Hive's own scope, not an independent one — denies a wrong-project operator", async () => {
    const hive = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-006`,
      locationId: apiarySiteId,
      projectId: projectAId,
    });

    await expect(
      createColony(wrongProjectUserAccountId, {
        hiveId: hive.id,
        startedAt: new Date("2026-01-01"),
        originType: "purchased",
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(ApiaryAccessError);
  });

  it("rejects an unknown hiveId", async () => {
    await expect(
      createColony(authorizedUserAccountId, {
        hiveId: "00000000-0000-0000-0000-000000000000",
        startedAt: new Date("2026-01-01"),
        originType: "purchased",
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(ApiaryAccessError);
  });
});

describe("getHive", () => {
  it("returns the Hive with its Colonies included, for an authorized viewer", async () => {
    const hive = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-007`,
      locationId: apiarySiteId,
      projectId: projectAId,
    });
    await createColony(authorizedUserAccountId, {
      hiveId: hive.id,
      startedAt: new Date("2026-01-01"),
      originType: "purchased",
      provenanceClass: "direct_observation",
    });

    const reloaded = await getHive(authorizedUserAccountId, hive.id);
    expect(reloaded.colonies).toHaveLength(1);
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    const hive = await createHive(authorizedUserAccountId, {
      identifier: `${RUN_ID}-H-008`,
      locationId: apiarySiteId,
      projectId: projectAId,
    });

    await expect(getHive(wrongProjectUserAccountId, hive.id)).rejects.toThrow(ApiaryAccessError);
  });
});
