/**
 * La reina de la colonia, por intervalos — «reina por colonia».
 *
 * Spec: docs/superpowers/specs/2026-09-18-faenas-division-y-reinas-design.md §4. Plan: Tarea 4.
 * Nombres de SAGARPA: «crianza de reinas», «cambio de reinas», «introducción de reinas». Sin marca
 * (Daniel: «no marcamos las reinas»).
 *
 * Grupo `base-sembrada`: los CHECK y los índices parciales sólo se afirman contra Postgres.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { ApiaryAccessError, crearApiario, createColony, createHive } from "../../lib/apiary/hives";
import { cambiarReina, cerrarTenencia, estadoDeReina, historiaDeReinas, introducirReina, reinaDeColonia } from "../../lib/apiary/reinas";

const RUN = `rei-${Date.now()}`;
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);

let organizationId: string;
let apiarioId: string;
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
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: apiarioId } })).id;
  await prisma.assignment.create({ data: { userAccountId: operario, roleProfileId: perfil.id, scopeId } });
}, 30000);

async function colonia() {
  const h = await createHive(adminId, { identifier: `${RUN}-${cajas.length}`, locationId: apiarioId });
  cajas.push(h.id);
  return (await createColony(adminId, { hiveId: h.id, originType: "purchased", startedAt: hace(120), provenanceClass: "direct_observation" })).id;
}

afterEach(async () => {
  const colonias = (await prisma.colony.findMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }), select: { id: true } })).map((c) => c.id);
  const tenencias = await prisma.queenTenure.findMany({ where: assertDefinedWhere({ colonyId: { in: colonias } }), select: { id: true, queenId: true } });
  const reinas = [...new Set(tenencias.map((t) => t.queenId))];
  const criadas = (await prisma.queen.findMany({ where: assertDefinedWhere({ originColonyId: { in: colonias } }), select: { id: true } })).map((q) => q.id);
  const todas = [...new Set([...reinas, ...criadas])];
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...todas, ...tenencias.map((t) => t.id)] } }) });
  await prisma.queenTenure.deleteMany({ where: assertDefinedWhere({ queenId: { in: todas } }) });
  await prisma.queen.deleteMany({ where: assertDefinedWhere({ id: { in: todas } }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias } }) });
});

afterAll(async () => {
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: cajas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: apiarioId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
}, 30000);

describe("la reina de la colonia", () => {
  it("introducir una reina abre su tenencia, y es la reina de hoy", async () => {
    const colonyId = await colonia();
    const { reina, tenencia } = await introducirReina(operario, { colonyId, origen: "comprada", desde: hace(10) });
    expect(tenencia.hasta).toBeNull();
    expect(reina.origin).toBe("comprada");
    expect((await reinaDeColonia(operario, colonyId))?.id).toBe(reina.id);
    const ev = await prisma.auditEvent.findFirst({ where: { entityType: "queen_tenure", entityId: tenencia.id, operation: "queen.introduce" } });
    expect(ev).not.toBeNull();
  }, 20000);

  it("cambiar la reina cierra la vieja y abre la nueva en el MISMO instante", async () => {
    const colonyId = await colonia();
    const madre = await colonia();
    await introducirReina(operario, { colonyId, origen: "comprada", desde: hace(20) });
    const cuando = hace(5);
    const r = await cambiarReina(operario, { colonyId, nueva: { origen: "criada_aqui", origenColonyId: madre }, cuando, finDeLaVieja: "cambiada" });
    expect(r.cerrada.hasta?.getTime()).toBe(cuando.getTime());
    expect(r.abierta.desde.getTime()).toBe(cuando.getTime());
    expect(r.cerrada.fin).toBe("cambiada");
    expect(r.reina.originColonyId).toBe(madre);
  }, 20000);

  it("¿qué reina tenía en una fecha anterior? — la de entonces, no la de hoy", async () => {
    const colonyId = await colonia();
    const { reina: vieja } = await introducirReina(operario, { colonyId, origen: "comprada", desde: hace(20) });
    const { reina: nueva } = await cambiarReina(operario, { colonyId, nueva: { origen: "natural" }, cuando: hace(5), finDeLaVieja: "muerta" });
    expect((await reinaDeColonia(operario, colonyId, hace(8)))?.id).toBe(vieja.id);
    expect((await reinaDeColonia(operario, colonyId))?.id).toBe(nueva.id);
    expect((await historiaDeReinas(operario, colonyId)).map((t) => t.queen.id)).toEqual([nueva.id, vieja.id]);
  }, 20000);

  it("no se introduce una segunda reina si ya hay una — eso es cambiar; y la base tampoco lo acepta", async () => {
    const colonyId = await colonia();
    const { reina } = await introducirReina(operario, { colonyId, origen: "comprada", desde: hace(10) });
    await expect(introducirReina(operario, { colonyId, origen: "natural", desde: hace(5) })).rejects.toThrow(/ya_tiene_reina/);
    const otra = await prisma.queen.create({ data: { origin: "natural", provenanceClass: "direct_observation" } });
    await expect(prisma.queenTenure.create({ data: { queenId: otra.id, colonyId, desde: hace(4) } })).rejects.toThrow(/colony_id/);
    await prisma.queen.delete({ where: { id: otra.id } });
    expect((await reinaDeColonia(operario, colonyId))?.id).toBe(reina.id);
  }, 20000);

  it("el cambio no puede empezar antes que la reina vigente", async () => {
    const colonyId = await colonia();
    await introducirReina(operario, { colonyId, origen: "comprada", desde: hace(10) });
    await expect(cambiarReina(operario, { colonyId, nueva: { origen: "natural" }, cuando: hace(12), finDeLaVieja: "cambiada" })).rejects.toThrow(
      /cambio_antes_de_la_vigente/,
    );
  }, 20000);

  it("«criada aquí» exige de qué colonia salió; los demás no la llevan — servicio y base", async () => {
    const colonyId = await colonia();
    await expect(introducirReina(operario, { colonyId, origen: "criada_aqui", desde: hace(1) })).rejects.toThrow(/criada_aqui_sin_colonia/);
    await expect(prisma.queen.create({ data: { origin: "criada_aqui", provenanceClass: "direct_observation" } })).rejects.toThrow(
      /queen_criada_aqui_con_colonia/,
    );
    await expect(
      introducirReina(operario, { colonyId, origen: "comprada", origenColonyId: colonyId, desde: hace(1) }),
    ).rejects.toThrow(/colonia_de_origen_solo_si_criada_aqui/);
  }, 20000);

  it("«otro» exige nota, en el origen y en el fin", async () => {
    const colonyId = await colonia();
    await expect(introducirReina(operario, { colonyId, origen: "otro", desde: hace(3) })).rejects.toThrow(/otro_sin_nota/);
    await introducirReina(operario, { colonyId, origen: "otro", notas: "regalada por un vecino", desde: hace(3) });
    await expect(cerrarTenencia(operario, { colonyId, cuando: hace(1), fin: "otro" })).rejects.toThrow(/fin_otro_sin_nota/);
  }, 20000);

  it("huérfana: la última reina terminó y ninguna abrió", async () => {
    const colonyId = await colonia();
    await introducirReina(operario, { colonyId, origen: "comprada", desde: hace(10) });
    const murio = hace(2);
    await cerrarTenencia(operario, { colonyId, cuando: murio, fin: "muerta" });
    const e = await estadoDeReina(operario, colonyId);
    expect(e.estado).toBe("HUERFANA");
    expect(e.desde?.getTime()).toBe(murio.getTime());
  }, 20000);

  it("una colonia sin NINGUNA reina registrada NO es huérfana: es «sin registro»", async () => {
    // «Nunca registrada» no es «huérfana» (ADR-080). Si esta prueba cae, se está afirmando una
    // orfandad que nadie vio.
    const colonyId = await colonia();
    expect((await estadoDeReina(operario, colonyId)).estado).toBe("SIN_REGISTRO");
  }, 20000);

  it("con reina abierta: CON_REINA desde su fecha", async () => {
    const colonyId = await colonia();
    const desde = hace(7);
    await introducirReina(operario, { colonyId, origen: "de_enjambre", desde });
    const e = await estadoDeReina(operario, colonyId);
    expect(e.estado).toBe("CON_REINA");
    expect(e.desde?.getTime()).toBe(desde.getTime());
  }, 20000);

  it("sin apiary:manage no se introduce ni se cambia — y el control positivo", async () => {
    const colonyId = await colonia();
    await expect(introducirReina(ajeno, { colonyId, origen: "comprada", desde: hace(1) })).rejects.toThrow(ApiaryAccessError);
    await expect(estadoDeReina(ajeno, colonyId)).rejects.toThrow(ApiaryAccessError);
    await expect(introducirReina(operario, { colonyId, origen: "comprada", desde: hace(1) })).resolves.toBeTruthy();
  }, 20000);
});

// Spec 2026-09-18 §5.4, y Daniel el 2026-09-19: el color del año es sólo un APODO de la reina —
// «no marcamos las reinas» sigue valiendo—. Se guarda el año en que nació, si se sabe; el color
// lo calcula `colorDelAño`, el mismo que el de la cera de ese año.
describe("el año en que nació la reina", () => {
  it("SE GUARDA si se sabe, al introducir y al cambiar; si no se sabe, queda nulo", async () => {
    const colonyId = await colonia();
    const { reina: sinAno } = await introducirReina(operario, { colonyId, origen: "comprada", desde: hace(20) });
    expect(sinAno.birthYear).toBeNull();
    const año = hace(5).getUTCFullYear();
    const { reina } = await cambiarReina(operario, { colonyId, nueva: { origen: "natural", añoDeNacimiento: año }, cuando: hace(5), finDeLaVieja: "cambiada" });
    expect(reina.birthYear).toBe(año);
  });

  it("NO NACE DESPUÉS DE LLEGAR, ni en un año imposible", async () => {
    const colonyId = await colonia();
    const llegada = hace(3);
    await expect(
      introducirReina(operario, { colonyId, origen: "comprada", desde: llegada, añoDeNacimiento: llegada.getUTCFullYear() + 1 }),
    ).rejects.toThrow(/nacio_despues_de_llegar/);
    await expect(introducirReina(operario, { colonyId, origen: "comprada", desde: llegada, añoDeNacimiento: 1980 })).rejects.toThrow(/ano_de_nacimiento_invalido/);
    await expect(introducirReina(operario, { colonyId, origen: "comprada", desde: llegada, añoDeNacimiento: 2025.5 })).rejects.toThrow(/ano_de_nacimiento_invalido/);
    await expect(
      introducirReina(operario, { colonyId, origen: "comprada", desde: llegada, añoDeNacimiento: llegada.getUTCFullYear() }),
    ).resolves.toBeTruthy();
  });

  it("LA BASE tampoco acepta un año imposible — y lo válido entra", async () => {
    const sonda = async (año: string) => {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`INSERT INTO apiary.queen (origin, birth_year, provenance_class) VALUES ('comprada', ${año}, 'direct_observation')`);
          throw new Error("DESHACER");
        });
      } catch (e) {
        const m = (e as Error).message;
        return m.includes("DESHACER") ? "entra" : (m.match(/queen_[a-z_]+/)?.[0] ?? m.slice(0, 120));
      }
      return "?";
    };
    expect(await sonda("2026")).toBe("entra");
    expect(await sonda("NULL")).toBe("entra");
    expect(await sonda("1980")).toBe("queen_nacimiento_razonable");
  });
});
