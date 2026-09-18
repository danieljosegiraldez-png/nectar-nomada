/**
 * El nodo de sensores: un artefacto con identidad — artefactos de colmena, Tarea 4.
 *
 * Spec: docs/superpowers/specs/2026-09-17-artefactos-de-colmena-design.md §B y §7.1. Mover un
 * nodo reasigna datos —las observaciones de mayo pasan a colgar de otra colmena—, así que
 * instalarlo o moverlo exige `hive_node:manage`, que el `Farm Operator` NO tiene.
 *
 * Grupo `base-sembrada`: el permiso sale del catálogo sembrado, y la unicidad vive en Postgres.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { ApiaryAccessError, crearApiario, createHive } from "../../lib/apiary/hives";
import { instalarArtefacto, retirarArtefacto } from "../../lib/apiary/artefactos";
import { instalarNodo, registrarNodo } from "../../lib/apiary/nodos";

const RUN = `nod-${Date.now()}`;
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);

let organizationId: string;
let otraOrganizationId: string;
let apiarioId: string;
let apiarioAjeno: string;
let adminId: string;
let operario: string;
let gestor: string;
const scopes: string[] = [];
const cajas: string[] = [];
const personas: string[] = [];
let n = 0;

async function cuenta(nombre: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: nombre, displayName: `TEST ${nombre} (${RUN})`, locale: "es" } });
  personas.push(p.id);
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}
async function asignar(userAccountId: string, perfil: string, locationId: string) {
  const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  // El ámbito es único por sitio: la segunda asignación al mismo apiario lo reutiliza.
  const s =
    (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } })) ??
    (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  if (!scopes.includes(s.id)) scopes.push(s.id);
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: p.id, scopeId: s.id } });
}

beforeAll(async () => {
  const org = (nombre: string) =>
    prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${nombre} (${RUN})`, status: "approved", classification: "internal" } });
  organizationId = (await org("Farm")).id;
  otraOrganizationId = (await org("Otra")).id;
  adminId = await cuenta("Admin");
  operario = await cuenta("Operario");
  gestor = await cuenta("Gestor");
  const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: adminId, roleProfileId: admin.id, scopeId: plataforma.id } });
  apiarioId = (await crearApiario(adminId, { name: `TEST Apiario (${RUN})`, organizationId })).id;
  apiarioAjeno = (await crearApiario(adminId, { name: `TEST Apiario ajeno (${RUN})`, organizationId: otraOrganizationId })).id;
  await asignar(operario, "Farm Operator", apiarioId);
  await asignar(gestor, "Farm Manager", apiarioId);
}, 30000);

async function caja(locationId = apiarioId) {
  const c = await createHive(adminId, { identifier: `${RUN}-${cajas.length}`, locationId });
  cajas.push(c.id);
  return c.id;
}
const nodo = () => registrarNodo(gestor, { deviceId: `rp2040-${RUN}-${++n}`, locationId: apiarioId, hardware: "V1-P1", firmware: "1.0.0-rc1" });

afterEach(async () => {
  const ids = (await prisma.hiveFitting.findMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }), select: { id: true } })).map((f) => f.id);
  if (ids.length) await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: ids } }) });
  await prisma.hiveFitting.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
});

afterAll(async () => {
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.hiveNode.deleteMany({ where: assertDefinedWhere({ deviceId: { contains: RUN } }) });
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: cajas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [apiarioId, apiarioAjeno] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: [organizationId, otraOrganizationId] } }) });
}, 30000);

describe("el nodo, un artefacto con identidad", () => {
  it("se registra con su deviceId y su finca sale del sitio — y el deviceId no se repite", async () => {
    const a = await nodo();
    expect(a.organizationId).toBe(organizationId);
    expect(a.lifecycleStatus).toBe("active");
    await expect(registrarNodo(gestor, { deviceId: a.deviceId, locationId: apiarioId })).rejects.toThrow(/device_id_ya_registrado/);
  }, 20000);

  it("un Farm Operator NO puede instalar un nodo, aunque pueda instalar un excluidor", async () => {
    // El guardia de la tarea, con su control positivo al lado: sin él, este «no puede» sería
    // indistinguible del de una cuenta sin permisos.
    const hiveId = await caja();
    const a = await nodo();
    await expect(instalarArtefacto(operario, { hiveId, kind: "nodo_de_sensores", hiveNodeId: a.id, installedAt: hace(1) })).rejects.toThrow(
      ApiaryAccessError,
    );
    await expect(instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(1) })).resolves.toBeTruthy();
    // Ni registrarlo.
    await expect(registrarNodo(operario, { deviceId: `rp2040-${RUN}-op`, locationId: apiarioId })).rejects.toThrow(ApiaryAccessError);
  }, 20000);

  it("el gestor del apiario sí, y el intervalo apunta al aparato", async () => {
    const hiveId = await caja();
    const a = await nodo();
    const f = await instalarNodo(gestor, { hiveId, hiveNodeId: a.id, installedAt: hace(1) });
    expect(f.kind).toBe("nodo_de_sensores");
    expect(f.hiveNodeId).toBe(a.id);
  }, 20000);

  it("dos nodos no pueden estar en la misma colmena a la vez", async () => {
    // Dos observaciones del mismo minuto atribuidas a la misma colmena desde aparatos distintos
    // no se pueden reconciliar después.
    const hiveId = await caja();
    const [a, b] = [await nodo(), await nodo()];
    await instalarNodo(gestor, { hiveId, hiveNodeId: a.id, installedAt: hace(10) });
    await expect(instalarNodo(gestor, { hiveId, hiveNodeId: b.id, installedAt: hace(5) })).rejects.toThrow(/nodo_ya_instalado/);
  }, 20000);

  it("ni el mismo nodo en dos colmenas — ni siquiera con fecha atrasada que se cruce", async () => {
    const [h1, h2] = [await caja(), await caja()];
    const a = await nodo();
    const f = await instalarNodo(gestor, { hiveId: h1, hiveNodeId: a.id, installedAt: hace(10) });
    await expect(instalarNodo(gestor, { hiveId: h2, hiveNodeId: a.id, installedAt: hace(5) })).rejects.toThrow(/nodo_en_otra_colmena/);
    // Retirado el día 5, instalarlo en otra con fecha del día 7 se CRUZA con lo que ya pasó.
    await retirarArtefacto(gestor, { fittingId: f.id, removedAt: hace(5) });
    await expect(instalarNodo(gestor, { hiveId: h2, hiveNodeId: a.id, installedAt: hace(7) })).rejects.toThrow(/nodo_en_otra_colmena/);
  }, 20000);

  it("pero el MISMO nodo puede mudarse de colmena si se retira primero", async () => {
    const [h1, h2] = [await caja(), await caja()];
    const a = await nodo();
    const f = await instalarNodo(gestor, { hiveId: h1, hiveNodeId: a.id, installedAt: hace(10) });
    await retirarArtefacto(gestor, { fittingId: f.id, removedAt: hace(5) });
    await expect(instalarNodo(gestor, { hiveId: h2, hiveNodeId: a.id, installedAt: hace(4) })).resolves.toBeTruthy();
  }, 20000);

  it("retirar un nodo también exige hive_node:manage — moverlo es reasignar datos", async () => {
    const hiveId = await caja();
    const a = await nodo();
    const f = await instalarNodo(gestor, { hiveId, hiveNodeId: a.id, installedAt: hace(3) });
    await expect(retirarArtefacto(operario, { fittingId: f.id, removedAt: hace(1) })).rejects.toThrow(ApiaryAccessError);
    await expect(retirarArtefacto(gestor, { fittingId: f.id, removedAt: hace(1) })).resolves.toBeTruthy();
  }, 20000);

  it("un nodo de otra finca no se instala aquí", async () => {
    const hiveId = await caja();
    const ajeno = await registrarNodo(adminId, { deviceId: `rp2040-${RUN}-ajeno`, locationId: apiarioAjeno });
    await expect(instalarNodo(adminId, { hiveId, hiveNodeId: ajeno.id, installedAt: hace(1) })).rejects.toThrow(/nodo_de_otra_finca/);
  }, 20000);

  it("la BASE lo sostiene: un intervalo de nodo sin aparato, o un aparato en un no-nodo, no entra", async () => {
    const hiveId = await caja();
    const a = await nodo();
    await expect(
      prisma.hiveFitting.create({ data: { hiveId, kind: "nodo_de_sensores", installedAt: hace(1), provenanceClass: "direct_observation" } }),
    ).rejects.toThrow(/hive_fitting_nodo_con_aparato/);
    await expect(
      prisma.hiveFitting.create({ data: { hiveId, kind: "excluidor", hiveNodeId: a.id, installedAt: hace(1), provenanceClass: "direct_observation" } }),
    ).rejects.toThrow(/hive_fitting_nodo_con_aparato/);
    // Y dos abiertos en la misma colmena, aunque se salten el servicio.
    const b = await nodo();
    await prisma.hiveFitting.create({ data: { hiveId, kind: "nodo_de_sensores", hiveNodeId: a.id, installedAt: hace(2), provenanceClass: "direct_observation" } });
    await expect(
      prisma.hiveFitting.create({ data: { hiveId, kind: "nodo_de_sensores", hiveNodeId: b.id, installedAt: hace(1), provenanceClass: "direct_observation" } }),
    ).rejects.toThrow(/hive_id/);
  }, 20000);
});
