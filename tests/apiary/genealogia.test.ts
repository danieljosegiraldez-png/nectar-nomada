/**
 * La genealogía de la colonia: de cuál sale una división y con cuál se une una colonia.
 *
 * Spec: docs/superpowers/specs/2026-09-18-faenas-division-y-reinas-design.md §3.
 * Plan: docs/superpowers/plans/2026-09-18-faenas-division-y-reinas.md, Tarea 2.
 *
 * Grupo `base-sembrada`: los CHECK sólo se afirman contra Postgres.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { ApiaryAccessError, ColonyEndError, crearApiario, createColony, createHive, registrarFinDeColonia } from "../../lib/apiary/hives";
import { dividirColonia, lineaDeColonia, unirColonias } from "../../lib/apiary/genealogia";
import { estadoDeReina, introducirReina, reinaDeColonia } from "../../lib/apiary/reinas";

const RUN = `gen-${Date.now()}`;
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);

let organizationId: string;
let apiarioId: string;
let otroApiarioId: string;
let adminId: string;
let operario: string;
let ajeno: string;
let scopeId: string;
const cajas: string[] = [];
const personas: string[] = [];

async function cuenta(n: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN})`, locale: "es" } });
  personas.push(p.id);
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}

beforeAll(async () => {
  organizationId = (
    await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Farm (${RUN})`, status: "approved", classification: "internal" } })
  ).id;
  adminId = await cuenta("Admin");
  operario = await cuenta("Operario");
  ajeno = await cuenta("Ajeno");
  const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: adminId, roleProfileId: admin.id, scopeId: plataforma.id } });
  apiarioId = (await crearApiario(adminId, { name: `TEST Apiario (${RUN})`, organizationId })).id;
  otroApiarioId = (await crearApiario(adminId, { name: `TEST Otro apiario (${RUN})`, organizationId })).id;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: apiarioId } })).id;
  await prisma.assignment.create({ data: { userAccountId: operario, roleProfileId: perfil.id, scopeId } });
}, 30000);

async function caja(locationId = apiarioId) {
  const c = await createHive(adminId, { identifier: `${RUN}-${cajas.length}`, locationId });
  cajas.push(c.id);
  return c.id;
}
async function colonia(hiveId?: string) {
  const h = hiveId ?? (await caja());
  return createColony(adminId, { hiveId: h, originType: "purchased", startedAt: hace(90), provenanceClass: "direct_observation" });
}

afterEach(async () => {
  // Hijas antes que madres, absorbidas antes que receptoras: las FK son RESTRICT, y poner la madre
  // a nulo en una división es justo lo que la base prohíbe ahora. Se borra por capas: en cada vuelta,
  // las colonias a las que ninguna otra apunta.
  let quedan = (await prisma.colony.findMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }), select: { id: true } })).map((c) => c.id);
  if (quedan.length) await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: quedan } }) });
  // Las reinas antes que las colonias: sus tenencias apuntan a ellas.
  const tenencias = await prisma.queenTenure.findMany({ where: assertDefinedWhere({ colonyId: { in: quedan } }), select: { id: true, queenId: true } });
  const reinas = [...new Set(tenencias.map((t) => t.queenId))];
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: tenencias.map((t) => t.id) } }) });
  await prisma.queenTenure.deleteMany({ where: assertDefinedWhere({ queenId: { in: reinas } }) });
  await prisma.queen.deleteMany({ where: assertDefinedWhere({ id: { in: reinas } }) });
  for (let vuelta = 0; quedan.length && vuelta < 20; vuelta++) {
    const apuntadas = new Set(
      (
        await prisma.colony.findMany({
          where: { id: { in: quedan } },
          select: { parentColonyId: true, combinedIntoColonyId: true },
        })
      ).flatMap((c) => [c.parentColonyId, c.combinedIntoColonyId].filter((x): x is string => !!x)),
    );
    const hojas = quedan.filter((id) => !apuntadas.has(id));
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: hojas } }) });
    quedan = quedan.filter((id) => apuntadas.has(id));
  }
});

afterAll(async () => {
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: cajas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [apiarioId, otroApiarioId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
}, 30000);

describe("dividir", () => {
  it("crea la colonia hija en otra caja, con su madre, y deja la madre activa", async () => {
    const madre = await colonia();
    const destino = await caja();
    const hija = await dividirColonia(operario, { madreColonyId: madre.id, destinoHiveId: destino, occurredAt: hace(1) });
    expect(hija.parentColonyId).toBe(madre.id);
    expect(hija.originType).toBe("split");
    expect(hija.hiveId).toBe(destino);
    expect((await prisma.colony.findUniqueOrThrow({ where: { id: madre.id } })).status).toBe("active");
    const ev = await prisma.auditEvent.findFirst({ where: { entityType: "colony", entityId: hija.id, operation: "colony.split" } });
    expect(ev).not.toBeNull();
  }, 20000);

  it("no se divide hacia una caja ocupada por una colonia activa", async () => {
    const madre = await colonia();
    const ocupada = await colonia();
    await expect(dividirColonia(operario, { madreColonyId: madre.id, destinoHiveId: ocupada.hiveId, occurredAt: hace(1) })).rejects.toThrow(
      /caja_ocupada/,
    );
  }, 20000);

  it("ni desde una colonia que ya terminó, ni antes de que la madre empezara", async () => {
    const madre = await colonia();
    await expect(dividirColonia(operario, { madreColonyId: madre.id, destinoHiveId: await caja(), occurredAt: hace(200) })).rejects.toThrow(
      /division_antes_de_la_madre/,
    );
    await registrarFinDeColonia(adminId, { colonyId: madre.id, status: "dead", endedAt: hace(2) });
    await expect(dividirColonia(operario, { madreColonyId: madre.id, destinoHiveId: await caja(), occurredAt: hace(1) })).rejects.toThrow(
      /madre_no_activa/,
    );
  }, 20000);

  it("una colonia 'split' SIN madre ya no se crea — ni por el servicio ni por la base", async () => {
    const h = await caja();
    await expect(createColony(adminId, { hiveId: h, originType: "split", startedAt: hace(1), provenanceClass: "direct_observation" })).rejects.toThrow(
      /division_sin_madre/,
    );
    await expect(
      prisma.colony.create({ data: { hiveId: h, originType: "split", startedAt: hace(1), provenanceClass: "direct_observation", createdBy: adminId } }),
    ).rejects.toThrow(/colony_division_con_madre/);
    // Y la madre no se pone en una colonia que no es división.
    const madre = await colonia();
    await expect(
      prisma.colony.create({
        data: { hiveId: h, originType: "purchased", parentColonyId: madre.id, startedAt: hace(1), provenanceClass: "direct_observation", createdBy: adminId },
      }),
    ).rejects.toThrow(/colony_madre_solo_en_division/);
  }, 20000);

  it("la línea: de una madre salen sus hijas, y cada hija sabe su madre", async () => {
    const madre = await colonia();
    const h1 = await dividirColonia(operario, { madreColonyId: madre.id, destinoHiveId: await caja(), occurredAt: hace(3) });
    const h2 = await dividirColonia(operario, { madreColonyId: madre.id, destinoHiveId: await caja(), occurredAt: hace(2) });
    const linea = await lineaDeColonia(operario, madre.id);
    expect(linea.madre).toBeNull();
    expect(linea.hijas.map((c) => c.id).sort()).toEqual([h1.id, h2.id].sort());
    expect((await lineaDeColonia(operario, h1.id)).madre?.id).toBe(madre.id);
  }, 20000);
});

describe("unir", () => {
  it("cierra la débil como 'combined' apuntando a la que recibe; la receptora sigue activa", async () => {
    const [debil, receptora] = [await colonia(), await colonia()];
    const cerrada = await unirColonias(operario, { debilColonyId: debil.id, receptoraColonyId: receptora.id, occurredAt: hace(1) });
    expect(cerrada.status).toBe("combined");
    expect(cerrada.combinedIntoColonyId).toBe(receptora.id);
    expect(cerrada.endedAt).not.toBeNull();
    expect((await prisma.colony.findUniqueOrThrow({ where: { id: receptora.id } })).status).toBe("active");
  }, 20000);

  it("'combined' sin receptora ya no se registra por el fin de colonia — se usa Unir", async () => {
    const c = await colonia();
    await expect(registrarFinDeColonia(operario, { colonyId: c.id, status: "combined", endedAt: hace(1) })).rejects.toThrow(ColonyEndError);
    await expect(registrarFinDeColonia(operario, { colonyId: c.id, status: "combined", endedAt: hace(1) })).rejects.toThrow(/union_sin_receptora/);
  }, 20000);

  it("no consigo misma, ni con una que terminó, ni con una de otro apiario", async () => {
    const [a, b] = [await colonia(), await colonia()];
    await expect(unirColonias(operario, { debilColonyId: a.id, receptoraColonyId: a.id, occurredAt: hace(1) })).rejects.toThrow(/union_consigo_misma/);
    const lejos = await colonia(await caja(otroApiarioId));
    await expect(unirColonias(adminId, { debilColonyId: a.id, receptoraColonyId: lejos.id, occurredAt: hace(1) })).rejects.toThrow(
      /union_entre_apiarios/,
    );
    await registrarFinDeColonia(adminId, { colonyId: b.id, status: "dead", endedAt: hace(2) });
    await expect(unirColonias(operario, { debilColonyId: a.id, receptoraColonyId: b.id, occurredAt: hace(1) })).rejects.toThrow(/receptora_no_activa/);
  }, 20000);
});

describe("la reina en la división", () => {
  it("con reinaVa 'hija', la reina vigente pasa a la hija en la misma transacción, y la madre queda huérfana", async () => {
    const madre = await colonia();
    const { reina } = await introducirReina(operario, { colonyId: madre.id, origen: "comprada", desde: hace(10) });
    const hija = await dividirColonia(operario, { madreColonyId: madre.id, destinoHiveId: await caja(), occurredAt: hace(1), reinaVa: "hija" });
    expect((await reinaDeColonia(operario, hija.id))?.id).toBe(reina.id);
    const enLaMadre = await estadoDeReina(operario, madre.id);
    expect(enLaMadre.estado).toBe("HUERFANA");
    expect(enLaMadre.desde?.getTime()).toBe(hija.startedAt.getTime());
  }, 20000);

  it("con reinaVa 'madre' la reina se queda, y la hija empieza sin reina registrada", async () => {
    const madre = await colonia();
    const { reina } = await introducirReina(operario, { colonyId: madre.id, origen: "comprada", desde: hace(10) });
    const hija = await dividirColonia(operario, { madreColonyId: madre.id, destinoHiveId: await caja(), occurredAt: hace(1), reinaVa: "madre" });
    expect((await reinaDeColonia(operario, madre.id))?.id).toBe(reina.id);
    expect((await estadoDeReina(operario, hija.id)).estado).toBe("SIN_REGISTRO");
  }, 20000);

  it("sin reina registrada en la madre, reinaVa 'hija' no inventa ninguna", async () => {
    const madre = await colonia();
    const hija = await dividirColonia(operario, { madreColonyId: madre.id, destinoHiveId: await caja(), occurredAt: hace(1), reinaVa: "hija" });
    expect((await estadoDeReina(operario, hija.id)).estado).toBe("SIN_REGISTRO");
    expect((await estadoDeReina(operario, madre.id)).estado).toBe("SIN_REGISTRO");
  }, 20000);
});

describe("permisos", () => {
  it("sin apiary:manage no se divide ni se une — y el control positivo", async () => {
    const madre = await colonia();
    const destino = await caja();
    await expect(dividirColonia(ajeno, { madreColonyId: madre.id, destinoHiveId: destino, occurredAt: hace(1) })).rejects.toThrow(ApiaryAccessError);
    const otra = await colonia();
    await expect(unirColonias(ajeno, { debilColonyId: otra.id, receptoraColonyId: madre.id, occurredAt: hace(1) })).rejects.toThrow(ApiaryAccessError);
    await expect(dividirColonia(operario, { madreColonyId: madre.id, destinoHiveId: destino, occurredAt: hace(1) })).resolves.toBeTruthy();
  }, 20000);
});
