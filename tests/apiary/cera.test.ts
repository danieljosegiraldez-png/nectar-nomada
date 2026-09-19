/**
 * La cera con el color de su año — spec docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md §5.
 *
 * Grupo `base-sembrada`: los permisos salen del catálogo sembrado y las reglas viven en Postgres.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearApiario, createHive } from "../../lib/apiary/hives";

const RUN = `cer-${Date.now()}`;

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
  const orgs = [organizationId, otraOrganizationId];
  const entradas = (await prisma.newWaxEntry.findMany({ where: assertDefinedWhere({ organizationId: { in: orgs } }), select: { id: true } })).map((x) => x.id);
  const salidas = (await prisma.frameRemoval.findMany({ where: assertDefinedWhere({ organizationId: { in: orgs } }), select: { id: true } })).map((x) => x.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...entradas, ...salidas] } }) });
  await prisma.newWaxEntry.deleteMany({ where: assertDefinedWhere({ id: { in: entradas } }) });
  await prisma.frameRemoval.deleteMany({ where: assertDefinedWhere({ id: { in: salidas } }) });
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
    return m.match(/(new_wax_entry|frame_removal)_[a-z_]+/)?.[0] ?? m.slice(0, 160);
  }
  return "?";
}

describe("las reglas de la cera viven en la base", () => {
  it("cada CHECK rechaza lo suyo, y lo válido entra", async () => {
    const entrada = (cuantos: number, tipo: string, nota: string | null) =>
      `INSERT INTO apiary.new_wax_entry (organization_id, entered_at, frame_count, wax_kind, notes, provenance_class)
       VALUES ('${organizationId}', now(), ${cuantos}, '${tipo}', ${nota === null ? "NULL" : `'${nota}'`}, 'direct_observation')`;
    expect(await sonda(entrada(10, "lamina_comprada", null))).toBe("entra");
    expect(await sonda(entrada(0, "lamina_comprada", null))).toBe("new_wax_entry_marcos_positivos");
    expect(await sonda(entrada(5, "otro", null))).toBe("new_wax_entry_otro_con_nota");
    expect(await sonda(entrada(5, "otro", "  "))).toBe("new_wax_entry_otro_con_nota");
    expect(await sonda(entrada(5, "otro", "de un vecino"))).toBe("entra");

    const salida = (año: string, cuando: string, cuantos: number, motivo: string, nota: string | null) =>
      `INSERT INTO apiary.frame_removal (organization_id, wax_year, removed_at, frame_count, reason, notes)
       VALUES ('${organizationId}', ${año}, ${cuando}, ${cuantos}, '${motivo}', ${nota === null ? "NULL" : `'${nota}'`})`;
    expect(await sonda(salida("2024", "'2026-05-01'", 3, "cera_vieja", null))).toBe("entra");
    expect(await sonda(salida("2026", "'2026-05-01'", 3, "cera_vieja", null))).toBe("entra");
    expect(await sonda(salida("2027", "'2026-05-01'", 3, "cera_vieja", null))).toBe("frame_removal_ano_ya_llegado");
    expect(await sonda(salida("1980", "'2026-05-01'", 3, "cera_vieja", null))).toBe("frame_removal_ano_ya_llegado");
    expect(await sonda(salida("2024", "'2026-05-01'", 0, "cera_vieja", null))).toBe("frame_removal_marcos_positivos");
    expect(await sonda(salida("2024", "'2026-05-01'", 3, "otro", null))).toBe("frame_removal_otro_con_nota");
  });
});
