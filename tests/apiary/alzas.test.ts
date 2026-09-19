/**
 * Alzas con marca — spec docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md §4.
 *
 * Grupo `base-sembrada`: los permisos salen del catálogo sembrado y las reglas viven en Postgres.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearApiario, createColony, createHive } from "../../lib/apiary/hives";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { alzasDelApiario, darDeBajaAlza, ponerAlza, registrarAlza } from "../../lib/apiary/alzas";
import { cerrarAbiertosEn, instalarArtefacto, retirarArtefacto } from "../../lib/apiary/artefactos";

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
  const eventos = await prisma.apiaryHarvestEvent.findMany({ where: { colony: { hiveId: { in: cajas } } }, select: { id: true, resultingLotId: true } });
  await prisma.apiaryHarvestSuper.deleteMany({ where: assertDefinedWhere({ apiaryHarvestEventId: { in: eventos.map((e) => e.id) } }) });
  await prisma.apiaryHarvestSuper.deleteMany({ where: assertDefinedWhere({ hiveSuperId: { in: alzas } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: eventos.map((e) => e.id) } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: eventos.map((e) => e.resultingLotId) } }) });
  await prisma.apiaryHarvestEvent.deleteMany({ where: assertDefinedWhere({ id: { in: eventos.map((e) => e.id) } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: eventos.map((e) => e.resultingLotId) } }) });
  const colonias = (await prisma.colony.findMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }), select: { id: true } })).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: colonias } }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias } }) });
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

/** La fila de un alza en el listado del apiario, vista por el operario. Si no está, falla aquí. */
async function filaDe(id: string) {
  const fila = (await alzasDelApiario(operario, apiarioId)).find((x) => x.id === id);
  if (!fila) throw new Error(`el alza ${id} no sale en el listado`);
  return fila;
}

describe("alzas con marca", () => {
  const marca = (s: string) => `${s}-${RUN}`;

  it("SE REGISTRA NORMALIZADA, y la misma marca en la misma finca se rechaza con su nombre", async () => {
    const a = await registrarAlza(operario, { locationId: apiarioId, code: `  ${marca("a7")} ` });
    expect(a.code).toBe(marca("A7").toUpperCase());
    expect(a.organizationId).toBe(organizationId);
    await expect(registrarAlza(operario, { locationId: apiarioId, code: marca("A7") })).rejects.toThrow(/marca_repetida/);
    await expect(registrarAlza(operario, { locationId: apiarioId, code: "   " })).rejects.toThrow(/marca_requerida/);
  });

  it("PONERLA abre su intervalo de cuenta 1; QUITARLA lo cierra; y queda la historia", async () => {
    const hiveId = await caja();
    const a = await registrarAlza(operario, { locationId: apiarioId, code: marca("P") });
    const f = await ponerAlza(operario, { hiveId, hiveSuperId: a.id, installedAt: hace(10) });
    expect([f.kind, f.count, f.hiveSuperId]).toEqual(["alza", 1, a.id]);
    await retirarArtefacto(operario, { fittingId: f.id, removedAt: hace(2) });
    const fila = await filaDe(a.id);
    expect(fila.puestaEn).toBeNull();
    expect(fila.historia.map((h) => [h.aqui, h.hasta !== null])).toEqual([[true, true]]);
  });

  it("NO SE PONE EN DOS COLMENAS: ni abierta ni solapando un intervalo ya cerrado", async () => {
    const [c1, c2] = [await caja(), await caja()];
    const a = await registrarAlza(operario, { locationId: apiarioId, code: marca("D") });
    const f = await ponerAlza(operario, { hiveId: c1, hiveSuperId: a.id, installedAt: hace(10) });
    await expect(ponerAlza(operario, { hiveId: c2, hiveSuperId: a.id, installedAt: hace(5) })).rejects.toThrow(/alza_en_otra_colmena/);
    await retirarArtefacto(operario, { fittingId: f.id, removedAt: hace(3) });
    // Cerrada el día -3: ponerla el día -5 en otra caja la tendría en dos sitios esos dos días.
    await expect(ponerAlza(operario, { hiveId: c2, hiveSuperId: a.id, installedAt: hace(5) })).rejects.toThrow(/alza_en_otra_colmena/);
    await expect(ponerAlza(operario, { hiveId: c2, hiveSuperId: a.id, installedAt: hace(1) })).resolves.toBeTruthy();
  });

  it("NO SE PONE una dada de baja, ni una de otra finca, y SIN PERMISO no se toca", async () => {
    const hiveId = await caja();
    const baja = await registrarAlza(operario, { locationId: apiarioId, code: marca("B") });
    await darDeBajaAlza(operario, { hiveSuperId: baja.id, retiredAt: hace(1), reason: "madera podrida" });
    await expect(ponerAlza(operario, { hiveId, hiveSuperId: baja.id, installedAt: new Date() })).rejects.toThrow(/alza_dada_de_baja/);
    const ajena = await registrarAlza(adminId, { locationId: apiarioAjeno, code: marca("X") });
    await expect(ponerAlza(operario, { hiveId, hiveSuperId: ajena.id, installedAt: new Date() })).rejects.toThrow(/alza_de_otra_finca/);
    await expect(registrarAlza(extrano, { locationId: apiarioId, code: marca("Z") })).rejects.toThrow(/no_apiary_access/);
    const mia = await registrarAlza(operario, { locationId: apiarioId, code: marca("M") });
    await expect(ponerAlza(extrano, { hiveId, hiveSuperId: mia.id, installedAt: new Date() })).rejects.toThrow(/no_apiary_access/);
  });

  it("DAR DE BAJA pide motivo y no se hace con el alza puesta", async () => {
    const hiveId = await caja();
    const a = await registrarAlza(operario, { locationId: apiarioId, code: marca("Q") });
    await expect(darDeBajaAlza(operario, { hiveSuperId: a.id, retiredAt: new Date(), reason: " " })).rejects.toThrow(/baja_sin_motivo/);
    await ponerAlza(operario, { hiveId, hiveSuperId: a.id, installedAt: hace(3) });
    await expect(darDeBajaAlza(operario, { hiveSuperId: a.id, retiredAt: new Date(), reason: "rota" })).rejects.toThrow(/alza_puesta/);
  });

  it("LA INSPECCIÓN QUE QUITA ALZAS NO SE LLEVA LAS MARCADAS: sólo cierra las de cuenta", async () => {
    const hiveId = await caja();
    const a = await registrarAlza(operario, { locationId: apiarioId, code: marca("I") });
    await ponerAlza(operario, { hiveId, hiveSuperId: a.id, installedAt: hace(10) });
    await instalarArtefacto(operario, { hiveId, kind: "alza", count: 2, installedAt: hace(10) });
    const cerradas = await prisma.$transaction(cerrarAbiertosEn(operario, hiveId, "alza", hace(1)));
    expect(cerradas).toBe(1);
    const abiertas = await prisma.hiveFitting.findMany({ where: { hiveId, removedAt: null } });
    expect(abiertas.map((f) => f.hiveSuperId)).toEqual([a.id]);
  });

  it("EL LISTADO NO ENSEÑA la caja de otro apiario: dice que está fuera", async () => {
    const otroApiario = (await crearApiario(adminId, { name: `TEST Apiario 2 (${RUN})`, organizationId })).id;
    try {
      const fuera = await caja(otroApiario);
      const a = await registrarAlza(operario, { locationId: apiarioId, code: marca("F") });
      await ponerAlza(adminId, { hiveId: fuera, hiveSuperId: a.id, installedAt: hace(1) });
      const fila = await filaDe(a.id);
      expect(fila.puestaEn?.aqui).toBe(false);
      expect(fila.puestaEn?.hiveId).toBe("");
      expect(fila.puestaEn?.identifier).toBe("");
      await expect(alzasDelApiario(extrano, apiarioId)).rejects.toThrow(/no_apiary_access/);
    } finally {
      const cajasFuera = (await prisma.hive.findMany({ where: { locationId: otroApiario }, select: { id: true } })).map((h) => h.id);
      const fits = (await prisma.hiveFitting.findMany({ where: assertDefinedWhere({ hiveId: { in: cajasFuera } }), select: { id: true } })).map((f) => f.id);
      await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: fits } }) });
      await prisma.hiveFitting.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajasFuera } }) });
      await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajasFuera } }) });
      await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: cajasFuera } }) });
      cajas.splice(0, cajas.length, ...cajas.filter((c) => !cajasFuera.includes(c)));
      await prisma.location.deleteMany({ where: assertDefinedWhere({ id: otroApiario }) });
    }
  });
});

describe("la cosecha y sus alzas", () => {
  it("DICE QUÉ ALZAS MARCADAS SE EXTRAJERON, sólo si estaban puestas en esa colmena ese día", async () => {
    const hiveId = await caja();
    const otraCaja = await caja();
    const colonia = await createColony(adminId, { hiveId, originType: "captured", startedAt: hace(60), provenanceClass: "direct_observation" });
    const puesta = await registrarAlza(operario, { locationId: apiarioId, code: `H1-${RUN}` });
    const fuera = await registrarAlza(operario, { locationId: apiarioId, code: `H2-${RUN}` });
    await ponerAlza(operario, { hiveId, hiveSuperId: puesta.id, installedAt: hace(20) });
    await ponerAlza(operario, { hiveId: otraCaja, hiveSuperId: fuera.id, installedAt: hace(20) });

    await expect(
      recordApiaryHarvest(operario, {
        colonyId: colonia.id, lotCode: `MIEL-${RUN}-no`, occurredAt: new Date(), provenanceClass: "measured_fact",
        hiveSuperIds: [puesta.id, fuera.id],
      }),
    ).rejects.toThrow(/alza_no_puesta_en_la_colmena/);
    // Todo o nada: el rechazo no dejó lote.
    expect(await prisma.lot.count({ where: { lotCode: `MIEL-${RUN}-no` } })).toBe(0);

    const { harvestEvent } = await recordApiaryHarvest(operario, {
      colonyId: colonia.id, lotCode: `MIEL-${RUN}-si`, occurredAt: new Date(), provenanceClass: "measured_fact",
      hiveSuperIds: [puesta.id],
    });
    const filas = await prisma.apiaryHarvestSuper.findMany({ where: { apiaryHarvestEventId: harvestEvent.id } });
    expect(filas.map((f) => f.hiveSuperId)).toEqual([puesta.id]);
    const fila = await filaDe(puesta.id);
    expect(fila.cosechas.map((c) => c.lotCode)).toEqual([`MIEL-${RUN}-si`]);
  });

  it("SIN ALZAS MARCADAS la cosecha vale igual", async () => {
    const hiveId = await caja();
    const colonia = await createColony(adminId, { hiveId, originType: "captured", startedAt: hace(60), provenanceClass: "direct_observation" });
    const { harvestEvent } = await recordApiaryHarvest(operario, {
      colonyId: colonia.id, lotCode: `MIEL-${RUN}-sin`, occurredAt: new Date(), provenanceClass: "measured_fact",
    });
    expect(await prisma.apiaryHarvestSuper.count({ where: { apiaryHarvestEventId: harvestEvent.id } })).toBe(0);
  });
});
