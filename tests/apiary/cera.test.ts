/**
 * La cera con el color de su año — spec docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md §5.
 *
 * Grupo `base-sembrada`: los permisos salen del catálogo sembrado y las reglas viven en Postgres.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearApiario, createHive } from "../../lib/apiary/hives";
import { colorDelAño } from "../../lib/apiary/colorDelAno";
import { leyendaDeCera, registrarCeraNueva, registrarSalidaDeMarcos } from "../../lib/apiary/cera";

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

const dia = (s: string) => new Date(`${s}T00:00:00Z`);

describe("la leyenda de la cera", () => {
  it("AGRUPA POR AÑO con su color, cuenta lo que entró y salió, y avisa por edad", async () => {
    await registrarCeraNueva(operario, { locationId: apiarioId, enteredAt: dia("2022-03-01"), frameCount: 20, waxKind: "lamina_comprada" });
    await registrarCeraNueva(operario, { locationId: apiarioId, enteredAt: dia("2024-06-10"), frameCount: 10, waxKind: "lamina_estampada_propia", destination: "alza" });
    await registrarCeraNueva(operario, { locationId: apiarioId, enteredAt: dia("2024-09-01"), frameCount: 5, waxKind: "sin_lamina" });
    await registrarSalidaDeMarcos(operario, { locationId: apiarioId, waxYear: 2022, removedAt: dia("2026-02-01"), frameCount: 8, reason: "cera_vieja" });
    const filas = await leyendaDeCera(operario, apiarioId, dia("2026-09-18"));
    expect(filas.map((f) => [f.año, f.color, f.entraron, f.salieron, f.edad, f.aviso])).toEqual([
      [2026, "blanco", 0, 0, 0, null],
      [2024, "verde", 15, 0, 2, "revisar"],
      [2022, "amarillo", 20, 8, 4, "renovar"],
    ]);
  });

  it("SALIERON MÁS DE LOS ANOTADOS se dice, no se impide", async () => {
    await registrarSalidaDeMarcos(operario, { locationId: apiarioId, waxYear: 2021, removedAt: dia("2026-01-10"), frameCount: 6, reason: "danado" });
    const fila = (await leyendaDeCera(operario, apiarioId, dia("2026-09-18"))).find((f) => f.año === 2021);
    if (!fila) throw new Error("2021 no sale en la leyenda");
    expect([fila.entraron, fila.salieron, fila.salieronDeMas, fila.color]).toEqual([0, 6, true, colorDelAño(2021)]);
  });

  it("CADA FINCA VE SU CERA: lo de otra organización no entra en la leyenda", async () => {
    await registrarCeraNueva(adminId, { locationId: apiarioAjeno, enteredAt: dia("2023-01-01"), frameCount: 99, waxKind: "lamina_comprada" });
    const filas = await leyendaDeCera(operario, apiarioId, dia("2026-09-18"));
    expect(filas.some((f) => f.año === 2023)).toBe(false);
  });

  it("LAS REGLAS DEL SERVICIO: otro con nota, colmena de la misma finca, permiso, y el año de la salida", async () => {
    await expect(registrarCeraNueva(operario, { locationId: apiarioId, enteredAt: dia("2026-01-01"), frameCount: 3, waxKind: "otro" })).rejects.toThrow(/otro_sin_nota/);
    await expect(registrarCeraNueva(operario, { locationId: apiarioId, enteredAt: dia("2026-01-01"), frameCount: 0, waxKind: "lamina_comprada" })).rejects.toThrow(/marcos_invalidos/);
    const ajena = await caja(apiarioAjeno);
    await expect(registrarCeraNueva(operario, { locationId: apiarioId, enteredAt: dia("2026-01-01"), frameCount: 3, waxKind: "lamina_comprada", hiveId: ajena })).rejects.toThrow(/colmena_de_otra_finca/);
    await expect(registrarCeraNueva(extrano, { locationId: apiarioId, enteredAt: dia("2026-01-01"), frameCount: 3, waxKind: "lamina_comprada" })).rejects.toThrow(/no_apiary_access/);
    await expect(registrarSalidaDeMarcos(operario, { locationId: apiarioId, waxYear: 2027, removedAt: dia("2026-05-01"), frameCount: 2, reason: "cera_vieja" })).rejects.toThrow(/ano_aun_no_llega/);
    await expect(leyendaDeCera(extrano, apiarioId)).rejects.toThrow(/no_apiary_access/);
  });

  it("DEJA RASTRO: cada entrada y cada salida con su AuditEvent", async () => {
    const e = await registrarCeraNueva(operario, { locationId: apiarioId, enteredAt: dia("2026-04-01"), frameCount: 4, waxKind: "lamina_comprada" });
    const s = await registrarSalidaDeMarcos(operario, { locationId: apiarioId, waxYear: 2026, removedAt: dia("2026-05-01"), frameCount: 1, reason: "enfermedad" });
    const ops = await prisma.auditEvent.findMany({ where: { entityId: { in: [e.id, s.id] } }, select: { operation: true } });
    expect(ops.map((o) => o.operation).sort()).toEqual(["frame_removal.create", "new_wax_entry.create"]);
  });
});
