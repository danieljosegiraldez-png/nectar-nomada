/**
 * Alzas con marca — spec docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md §4.
 *
 * Grupo `base-sembrada`: los permisos salen del catálogo sembrado y las reglas viven en Postgres.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearApiario, createHive } from "../../lib/apiary/hives";

const RUN = `alz-${Date.now()}`;
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);

let organizationId: string;
let otraOrganizationId: string;
let apiarioId: string;
let apiarioAjeno: string;
let adminId: string;
let operario: string;
let extrano: string;
const scopes: string[] = [];
const cajas: string[] = [];
const personas: string[] = [];

async function cuenta(nombre: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: nombre, displayName: `TEST ${nombre} (${RUN})`, locale: "es" } });
  personas.push(p.id);
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}
async function asignar(userAccountId: string, perfil: string, locationId: string) {
  const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
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
  extrano = await cuenta("Extrano");
  const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: adminId, roleProfileId: admin.id, scopeId: plataforma.id } });
  apiarioId = (await crearApiario(adminId, { name: `TEST Apiario (${RUN})`, organizationId })).id;
  apiarioAjeno = (await crearApiario(adminId, { name: `TEST Apiario ajeno (${RUN})`, organizationId: otraOrganizationId })).id;
  await asignar(operario, "Farm Operator", apiarioId);
  await asignar(extrano, "Farm Operator", apiarioAjeno);
}, 30000);

async function caja(locationId = apiarioId) {
  const c = await createHive(adminId, { identifier: `${RUN}-${cajas.length}`, locationId });
  cajas.push(c.id);
  return c.id;
}

afterEach(async () => {
  const fits = (await prisma.hiveFitting.findMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }), select: { id: true } })).map((f) => f.id);
  const alzas = (await prisma.hiveSuper.findMany({ where: assertDefinedWhere({ organizationId: { in: [organizationId, otraOrganizationId] } }), select: { id: true } })).map((a) => a.id);
  await prisma.apiaryHarvestSuper.deleteMany({ where: assertDefinedWhere({ hiveSuperId: { in: alzas } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...fits, ...alzas] } }) });
  await prisma.hiveFitting.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
  await prisma.hiveSuper.deleteMany({ where: assertDefinedWhere({ id: { in: alzas } }) });
});

afterAll(async () => {
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: cajas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [apiarioId, apiarioAjeno] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: [organizationId, otraOrganizationId] } }) });
});

/** Inserta en crudo dentro de una transacción que se deshace; devuelve «entra» o el nombre de la regla que lo impidió. */
async function sonda(sql: string): Promise<string> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(sql);
      throw new Error("DESHACER");
    });
  } catch (e) {
    const m = (e as Error).message;
    if (m.includes("DESHACER")) return "entra";
    return m.match(/hive_(super|fitting)_[a-z_]+/)?.[0] ?? m.slice(0, 160);
  }
  return "?";
}

describe("las reglas del alza viven en la base", () => {
  it("cada CHECK rechaza lo suyo, y lo válido entra", async () => {
    const alza = (code: string, extra = "", vals = "") =>
      `INSERT INTO apiary.hive_super (organization_id, code${extra}) VALUES ('${organizationId}', '${code}'${vals})`;
    expect(await sonda(alza("A-07"))).toBe("entra");
    expect(await sonda(alza("a-07"))).toBe("hive_super_marca_normalizada");
    expect(await sonda(alza(" A-07"))).toBe("hive_super_marca_normalizada");
    expect(await sonda(alza(""))).toBe("hive_super_marca_normalizada");
    expect(await sonda(alza("A-08", ", lifecycle_status, retired_at, retired_reason", ", 'retired', now(), 'rota'"))).toBe("entra");
    expect(await sonda(alza("A-09", ", lifecycle_status, retired_at", ", 'retired', now()"))).toBe("hive_super_baja_completa");
    expect(await sonda(alza("A-10", ", lifecycle_status, retired_at, retired_reason", ", 'retired', now(), '  '"))).toBe("hive_super_baja_completa");
    expect(await sonda(alza("A-11", ", retired_at, retired_reason", ", now(), 'x'"))).toBe("hive_super_baja_completa");

    const hiveId = await caja();
    const s = await prisma.hiveSuper.create({ data: { organizationId, code: `S-${RUN}`.toUpperCase() } });
    const fit = (kind: string, count: string, superId = s.id) =>
      `INSERT INTO apiary.hive_fitting (hive_id, kind, count, installed_at, provenance_class, hive_super_id)
       VALUES ('${hiveId}', '${kind}', ${count}, now(), 'direct_observation', '${superId}')`;
    expect(await sonda(fit("alza", "1"))).toBe("entra");
    expect(await sonda(fit("alza", "2"))).toBe("hive_fitting_alza_marcada_es_una");
    expect(await sonda(fit("excluidor", "NULL"))).toBe("hive_fitting_alza_marcada_es_una");
  });

  it("un alza marcada no queda ABIERTA en dos colmenas", async () => {
    const [c1, c2] = [await caja(), await caja()];
    const s = await prisma.hiveSuper.create({ data: { organizationId, code: `D-${RUN}`.toUpperCase() } });
    await prisma.hiveFitting.create({ data: { hiveId: c1, kind: "alza", count: 1, installedAt: hace(5), provenanceClass: "direct_observation", hiveSuperId: s.id } });
    const r = await sonda(
      `INSERT INTO apiary.hive_fitting (hive_id, kind, count, installed_at, provenance_class, hive_super_id)
       VALUES ('${c2}', 'alza', 1, now(), 'direct_observation', '${s.id}')`,
    );
    expect(r).toMatch(/hive_fitting_alza_abierta_en_una_colmena|Unique constraint|duplicate key/);
  });
});
