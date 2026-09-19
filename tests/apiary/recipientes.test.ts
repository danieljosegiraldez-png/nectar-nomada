/**
 * La pesada por recipiente — spec docs/superpowers/specs/2026-09-19-cera-y-pesada-por-recipiente-design.md §3.
 *
 * Grupo `base-sembrada`: permisos del catálogo sembrado, reglas en Postgres y el libro del lote.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearApiario, createColony, createHive } from "../../lib/apiary/hives";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";

const RUN = `rcp-${Date.now()}`;
const dia = (s: string) => new Date(`${s}T09:00:00Z`);

let organizationId: string;
let apiarioId: string;
let apiarioAjeno: string;
let adminId: string;
let operario: string;
let extrano: string;
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
  const s =
    (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } })) ??
    (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  if (!scopes.includes(s.id)) scopes.push(s.id);
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: p.id, scopeId: s.id } });
}

beforeAll(async () => {
  organizationId = (
    await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Farm (${RUN})`, status: "approved", classification: "internal" } })
  ).id;
  adminId = await cuenta("Admin");
  operario = await cuenta("Operario");
  extrano = await cuenta("Extrano");
  const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: adminId, roleProfileId: admin.id, scopeId: plataforma.id } });
  apiarioId = (await crearApiario(adminId, { name: `TEST Apiario (${RUN})`, organizationId })).id;
  apiarioAjeno = (await crearApiario(adminId, { name: `TEST Apiario ajeno (${RUN})`, organizationId })).id;
  await asignar(operario, "Farm Operator", apiarioId);
  await asignar(extrano, "Farm Operator", apiarioAjeno);
}, 30000);

/** Una caja con colonia y una cosecha sin peso; devuelve la cosecha. */
async function cosecha() {
  const h = await createHive(adminId, { identifier: `${RUN}-${cajas.length}`, locationId: apiarioId });
  cajas.push(h.id);
  const c = await createColony(adminId, { hiveId: h.id, originType: "purchased", startedAt: dia("2026-01-01"), provenanceClass: "direct_observation" });
  const { harvestEvent } = await recordApiaryHarvest(operario, {
    colonyId: c.id, lotCode: `MIEL-${RUN}-${++n}`, occurredAt: dia("2026-08-01"), provenanceClass: "measured_fact",
  });
  return harvestEvent;
}

afterEach(async () => {
  const eventos = await prisma.apiaryHarvestEvent.findMany({ where: assertDefinedWhere({ colony: { hiveId: { in: cajas } } }), select: { id: true, resultingLotId: true } });
  const ids = eventos.map((e) => e.id);
  const lotes = eventos.map((e) => e.resultingLotId);
  const recipientes = (await prisma.harvestContainer.findMany({ where: assertDefinedWhere({ apiaryHarvestEventId: { in: ids } }), select: { id: true } })).map((r) => r.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...ids, ...recipientes] } }) });
  await prisma.harvestContainer.deleteMany({ where: assertDefinedWhere({ id: { in: recipientes } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.apiaryHarvestEvent.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
});

afterAll(async () => {
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  const colonias = (await prisma.colony.findMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }), select: { id: true } })).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias } }) });
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: cajas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [apiarioId, apiarioAjeno] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

/** Inserta en crudo dentro de una transacción que se deshace; devuelve «entra» o la regla que lo impidió. */
async function sonda(sql: string): Promise<string> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(sql);
      throw new Error("DESHACER");
    });
  } catch (e) {
    const m = (e as Error).message;
    if (m.includes("DESHACER")) return "entra";
    return m.match(/harvest_container_[a-z_]+/)?.[0] ?? m.slice(0, 160);
  }
  return "?";
}

describe("las reglas del recipiente viven en la base", () => {
  it("cada CHECK rechaza lo suyo, y lo válido entra", async () => {
    const h = await cosecha();
    const ins = (label: string, bruto: string, tara: string) =>
      `INSERT INTO apiary.harvest_container (apiary_harvest_event_id, label, gross_kg, tare_kg) VALUES ('${h.id}', '${label}', ${bruto}, ${tara})`;
    expect(await sonda(ins("balde 1", "20.5", "1.2"))).toBe("entra");
    expect(await sonda(ins("balde 1", "1.0", "1.2"))).toBe("harvest_container_pesos_posibles");
    expect(await sonda(ins("balde 1", "1.2", "1.2"))).toBe("harvest_container_pesos_posibles");
    expect(await sonda(ins("balde 1", "5", "-0.1"))).toBe("harvest_container_pesos_posibles");
    expect(await sonda(ins("   ", "5", "1"))).toBe("harvest_container_etiqueta_dice_algo");
  });
});
