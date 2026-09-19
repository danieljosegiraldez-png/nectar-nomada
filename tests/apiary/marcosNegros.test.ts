/**
 * Marcos negros en la inspección — spec docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md
 * §5.3: las fuentes latinoamericanas leídas juzgan la cera vieja **por el aspecto**, así que el aviso
 * sale de lo que se ve.
 *
 * Grupo `base-sembrada`: permisos del catálogo sembrado, y la cola sin conexión escribe en Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearApiario, createColony, createHive } from "../../lib/apiary/hives";
import { recordInspection } from "../../lib/apiary/inspections";
import { marcosNegrosDelApiario } from "../../lib/apiary/cera";
import { pushFieldEvents } from "../../lib/sync/pushFieldEvents";

const RUN = `mng-${Date.now()}`;
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

/** Una caja con su colonia; devuelve los dos ids. */
async function colmena(locationId = apiarioId) {
  const h = await createHive(adminId, { identifier: `${RUN}-${cajas.length}`, locationId });
  cajas.push(h.id);
  const c = await createColony(adminId, { hiveId: h.id, originType: "purchased", startedAt: dia("2026-01-01"), provenanceClass: "direct_observation" });
  return { hiveId: h.id, identifier: h.identifier, colonyId: c.id };
}

afterAll(async () => {
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  const colonias = (await prisma.colony.findMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }), select: { id: true } })).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId: { in: colonias } }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias } }) });
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: cajas } }) });
  await prisma.device.deleteMany({ where: assertDefinedWhere({ label: { contains: RUN } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [apiarioId, apiarioAjeno] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("marcos negros en la inspección", () => {
  it("SE ANOTAN; vacío es «no se contó», que no es cero; negativo no vale", async () => {
    const { colonyId } = await colmena();
    const con = await recordInspection(operario, { colonyId, outcome: "nothing_unusual", occurredAt: dia("2026-05-01"), darkFrames: 3 });
    const sin = await recordInspection(operario, { colonyId, outcome: "nothing_unusual", occurredAt: dia("2026-05-02") });
    const vacio = await recordInspection(operario, { colonyId, outcome: "nothing_unusual", occurredAt: dia("2026-05-03"), darkFrames: "" });
    const cero = await recordInspection(operario, { colonyId, outcome: "nothing_unusual", occurredAt: dia("2026-05-04"), darkFrames: 0 });
    expect([con.darkFrames, sin.darkFrames, vacio.darkFrames, cero.darkFrames]).toEqual([3, null, null, 0]);
    await expect(recordInspection(operario, { colonyId, outcome: "nothing_unusual", darkFrames: -1 })).rejects.toThrow(/marcos_negros_invalido/);
    // Codex, #443: un blanco de espacios era `Number("  ") = 0`, un cero que nadie contó.
    const espacios = await recordInspection(operario, { colonyId, outcome: "nothing_unusual", occurredAt: dia("2026-05-05"), darkFrames: "   " });
    expect(espacios.darkFrames).toBeNull();
  });

  it("VIAJAN POR LA COLA SIN CONEXIÓN, y una inspección vieja sin el campo llega como «no se contó»", async () => {
    const { colonyId } = await colmena();
    const device = await prisma.device.create({ data: { label: `TEST PWA (${RUN})`, platform: "pwa", createdBy: operario } });
    const [a, b] = await pushFieldEvents(operario, device.id, [
      { kind: "inspection", clientDraftId: `${RUN}-con`, colonyId, occurredAt: dia("2026-06-01"), outcome: "nothing_unusual", darkFrames: "4" },
      { kind: "inspection", clientDraftId: `${RUN}-vieja`, colonyId, occurredAt: dia("2026-06-02"), outcome: "nothing_unusual" },
    ]);
    expect([a?.status, b?.status]).toEqual(["applied", "applied"]);
    const filas = await prisma.inspection.findMany({ where: { clientDraftId: { in: [`${RUN}-con`, `${RUN}-vieja`] } }, orderBy: { occurredAt: "asc" } });
    expect(filas.map((f) => f.darkFrames)).toEqual([4, null]);
  });
});

describe("el aviso de marcos negros en el apiario", () => {
  it("LA ÚLTIMA INSPECCIÓN QUE LOS CONTÓ manda: si se renovaron no avisa, y si la última no contó sigue la anterior", async () => {
    const a = await colmena();
    const b = await colmena();
    const c = await colmena();
    const d = await colmena();
    await recordInspection(operario, { colonyId: a.colonyId, outcome: "nothing_unusual", occurredAt: dia("2026-07-01"), darkFrames: 5 });
    await recordInspection(operario, { colonyId: b.colonyId, outcome: "nothing_unusual", occurredAt: dia("2026-07-01"), darkFrames: 0 });
    await recordInspection(operario, { colonyId: c.colonyId, outcome: "nothing_unusual", occurredAt: dia("2026-07-01"), darkFrames: 3 });
    await recordInspection(operario, { colonyId: c.colonyId, outcome: "nothing_unusual", occurredAt: dia("2026-08-01") });
    await recordInspection(operario, { colonyId: d.colonyId, outcome: "nothing_unusual", occurredAt: dia("2026-07-01"), darkFrames: 4 });
    await recordInspection(operario, { colonyId: d.colonyId, outcome: "nothing_unusual", occurredAt: dia("2026-08-01"), darkFrames: 0 });
    const aviso = await marcosNegrosDelApiario(operario, apiarioId);
    const mias = aviso.filter((f) => [a.hiveId, b.hiveId, c.hiveId, d.hiveId].includes(f.hiveId));
    expect(mias.map((f) => [f.identifier, f.marcos, f.fecha.toISOString().slice(0, 10)])).toEqual([
      [a.identifier, 5, "2026-07-01"],
      [c.identifier, 3, "2026-07-01"],
    ]);
  });

  it("EMPATE EN EL MISMO INSTANTE: manda el conteo mayor, para no esconder una renovación (Codex, #443)", async () => {
    const e = await colmena();
    const mismo = dia("2026-07-15");
    await recordInspection(operario, { colonyId: e.colonyId, outcome: "nothing_unusual", occurredAt: mismo, darkFrames: 0 });
    await recordInspection(operario, { colonyId: e.colonyId, outcome: "nothing_unusual", occurredAt: mismo, darkFrames: 5 });
    await recordInspection(operario, { colonyId: e.colonyId, outcome: "nothing_unusual", occurredAt: mismo, darkFrames: 0 });
    const fila = (await marcosNegrosDelApiario(operario, apiarioId)).find((f) => f.hiveId === e.hiveId);
    expect(fila?.marcos).toBe(5);
  });

  it("DE UNA COLONIA ANTERIOR: el aviso sigue, pero dice que el conteo no es de la colonia de hoy (Codex, #443)", async () => {
    const vieja = await colmena();
    await recordInspection(operario, { colonyId: vieja.colonyId, outcome: "nothing_unusual", occurredAt: dia("2026-06-01"), darkFrames: 4 });
    await prisma.colony.update({ where: { id: vieja.colonyId }, data: { status: "dead", endedAt: dia("2026-07-01") } });
    await createColony(adminId, { hiveId: vieja.hiveId, originType: "purchased", startedAt: dia("2026-07-10"), provenanceClass: "direct_observation" });
    const fila = (await marcosNegrosDelApiario(operario, apiarioId)).find((f) => f.hiveId === vieja.hiveId);
    expect([fila?.marcos, fila?.coloniaAnterior]).toEqual([4, true]);
    const viva = (await marcosNegrosDelApiario(operario, apiarioId)).find((f) => f.coloniaAnterior === false);
    expect(viva, "control: las de la colonia de hoy dicen false").toBeTruthy();
  });

  it("SÓLO LAS CAJAS DE ESTE APIARIO, y sin permiso no se ve", async () => {
    const fuera = await colmena(apiarioAjeno);
    await recordInspection(adminId, { colonyId: fuera.colonyId, outcome: "nothing_unusual", occurredAt: dia("2026-07-01"), darkFrames: 9 });
    const aviso = await marcosNegrosDelApiario(operario, apiarioId);
    expect(aviso.some((f) => f.hiveId === fuera.hiveId)).toBe(false);
    await expect(marcosNegrosDelApiario(extrano, apiarioId)).rejects.toThrow(/no_apiary_access/);
  });
});
