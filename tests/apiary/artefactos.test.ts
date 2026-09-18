/**
 * Los artefactos de una colmena: qué lleva puesto y DESDE CUÁNDO.
 *
 * Spec: docs/superpowers/specs/2026-09-17-artefactos-de-colmena-design.md §A.
 * Plan: docs/superpowers/plans/2026-09-17-artefactos-de-colmena.md, Tareas 1–3.
 *
 * Grupo `base-sembrada`: los intervalos y sus CHECK sólo se afirman contra Postgres.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { ApiaryAccessError, crearApiario, createColony, createHive } from "../../lib/apiary/hives";
import { recordInspection } from "../../lib/apiary/inspections";
import { actualizarConfiguracionDeCaja } from "../../lib/apiary/configuracionDeCaja";
import { artefactosDeColmena, historiaDeArtefactos, instalarArtefacto, retirarArtefacto } from "../../lib/apiary/artefactos";

const RUN = `art-${Date.now()}`;
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);

let organizationId: string;
let apiarioId: string;
let adminId: string;
let operario: string;
let ajeno: string;
let scopeId: string;
let hiveId: string;
const cajas: string[] = [];
const personas: string[] = [];

async function cuenta(n: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN})`, locale: "es" } });
  personas.push(p.id);
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}

beforeAll(async () => {
  organizationId = (
    await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN})`, status: "approved", classification: "internal" },
    })
  ).id;
  adminId = await cuenta("Admin");
  operario = await cuenta("Operario");
  ajeno = await cuenta("Ajeno");
  // El ámbito de plataforma se REUSA, nunca se crea ni se borra: es compartido.
  const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: adminId, roleProfileId: admin.id, scopeId: plataforma.id } });

  apiarioId = (await crearApiario(adminId, { name: `TEST Apiario (${RUN})`, organizationId })).id;
  // El operario: `Farm Operator` sobre el apiario, que es quien trabaja la colmena.
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: apiarioId } })).id;
  await prisma.assignment.create({ data: { userAccountId: operario, roleProfileId: perfil.id, scopeId } });
}, 30000);

// Una colmena nueva por prueba: los intervalos de una no deben contestar por otra.
async function cajaNueva() {
  const c = await createHive(adminId, { identifier: `${RUN}-${cajas.length}`, locationId: apiarioId });
  cajas.push(c.id);
  hiveId = c.id;
  return c.id;
}

afterEach(async () => {
  // En `afterEach`: una aserción que falla no se salta el borrado.
  const ids = (await prisma.hiveFitting.findMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }), select: { id: true } })).map((f) => f.id);
  if (ids.length) await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: ids } }) });
  await prisma.hiveFitting.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
  // La inspección va después: el intervalo la referencia con RESTRICT.
  const colonias = (await prisma.colony.findMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }), select: { id: true } })).map((c) => c.id);
  const insp = (await prisma.inspection.findMany({ where: assertDefinedWhere({ colonyId: { in: colonias } }), select: { id: true } })).map((i) => i.id);
  if (insp.length) await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: insp } }) });
  await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId: { in: colonias } }) });
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

describe("el intervalo — qué lleva puesta una colmena y desde cuándo", () => {
  it("un artefacto instalado y no retirado sigue puesto hoy", async () => {
    await cajaNueva();
    await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(30) });
    const puestos = await artefactosDeColmena(operario, hiveId);
    expect(puestos.map((a) => a.kind)).toContain("excluidor");
  }, 20000);

  it("y CONSULTADO EN UNA FECHA ANTERIOR, no estaba", async () => {
    // La razón entera de que esto sea un intervalo y no un booleano. Si esta
    // prueba cae, se está contestando con la foto de hoy a una pregunta sobre
    // el pasado — que es justo lo que la ingestión de telemetría no puede hacer.
    await cajaNueva();
    await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(30) });
    const antes = await artefactosDeColmena(operario, hiveId, hace(60));
    expect(antes.map((a) => a.kind)).not.toContain("excluidor");
  }, 20000);

  it("retirado, deja de estar puesto — pero SIGUE en la historia", async () => {
    await cajaNueva();
    const a = await instalarArtefacto(operario, { hiveId, kind: "reductor_de_piquera", installedAt: hace(30) });
    await retirarArtefacto(operario, { fittingId: a.id, removedAt: hace(10) });
    expect(await artefactosDeColmena(operario, hiveId)).toHaveLength(0);
    expect(await artefactosDeColmena(operario, hiveId, hace(20))).toHaveLength(1);
  }, 20000);

  it("el día del retiro ya NO estaba puesto: cerrado a la izquierda, abierto a la derecha", async () => {
    await cajaNueva();
    const a = await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(30) });
    const retiro = hace(10);
    await retirarArtefacto(operario, { fittingId: a.id, removedAt: retiro });
    expect(await artefactosDeColmena(operario, hiveId, retiro)).toHaveLength(0);
    expect(await artefactosDeColmena(operario, hiveId, new Date(retiro.getTime() - 1))).toHaveLength(1);
  }, 20000);

  it("no se puede retirar antes de instalar — y la BASE tampoco lo acepta", async () => {
    await cajaNueva();
    const a = await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(10) });
    await expect(retirarArtefacto(operario, { fittingId: a.id, removedAt: hace(20) })).rejects.toThrow(/retiro_anterior_a_instalacion/);
    // Un importador o SQL directo se saltan el servicio; la regla vive también en Postgres.
    await expect(prisma.hiveFitting.update({ where: { id: a.id }, data: { removedAt: hace(20) } })).rejects.toThrow(
      /hive_fitting_retiro_despues_de_instalacion/,
    );
  }, 20000);

  it("no se retira dos veces: lo retirado ya tiene su fecha", async () => {
    await cajaNueva();
    const a = await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(10) });
    await retirarArtefacto(operario, { fittingId: a.id, removedAt: hace(5) });
    await expect(retirarArtefacto(operario, { fittingId: a.id, removedAt: hace(1) })).rejects.toThrow(/ya_retirado/);
  }, 20000);

  it("las alzas llevan CUENTA, no una fila por alza — y sólo las alzas", async () => {
    // Nadie numera las alzas en el patio. La identidad por alza sería un dato que
    // el campo no puede sostener.
    await cajaNueva();
    const a = await instalarArtefacto(operario, { hiveId, kind: "alza", installedAt: hace(5), count: 2 });
    expect(a.count).toBe(2);
    await expect(instalarArtefacto(operario, { hiveId, kind: "alza", installedAt: hace(5) })).rejects.toThrow(/cuenta_de_alzas/);
    await expect(instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(5), count: 3 })).rejects.toThrow(
      /cuenta_sólo_para_alzas/,
    );
    await expect(
      prisma.hiveFitting.create({ data: { hiveId, kind: "alza", count: 0, installedAt: hace(1), provenanceClass: "direct_observation" } }),
    ).rejects.toThrow(/hive_fitting_cuenta_sólo_de_alzas/);
  }, 20000);

  it("«otro» exige su nota — un vocabulario sin escape enseña a mentir, uno sin nota no dice nada", async () => {
    await cajaNueva();
    await expect(instalarArtefacto(operario, { hiveId, kind: "otro", installedAt: hace(1) })).rejects.toThrow(/otro_sin_nota/);
    const a = await instalarArtefacto(operario, { hiveId, kind: "otro", installedAt: hace(1), notes: "trampa de polen" });
    expect(a.notes).toBe("trampa de polen");
  }, 20000);

  it("instalar y retirar dejan su rastro en la misma transacción", async () => {
    await cajaNueva();
    const a = await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(3) });
    await retirarArtefacto(operario, { fittingId: a.id, removedAt: hace(1) });
    const ops = (await prisma.auditEvent.findMany({ where: { entityType: "hive_fitting", entityId: a.id } })).map((e) => e.operation).sort();
    expect(ops).toEqual(["hive_fitting.install", "hive_fitting.remove"]);
  }, 20000);

  it("sin acceso al apiario no se instala nada — y el control positivo al lado", async () => {
    await cajaNueva();
    await expect(instalarArtefacto(ajeno, { hiveId, kind: "excluidor", installedAt: hace(1) })).rejects.toThrow(ApiaryAccessError);
    await expect(artefactosDeColmena(ajeno, hiveId)).rejects.toThrow(ApiaryAccessError);
    await expect(instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(1) })).resolves.toBeTruthy();
  }, 20000);
});

describe("la inspección declara el cambio, que es donde nacen los intervalos", () => {
  async function colonia() {
    await cajaNueva();
    return (
      await createColony(adminId, { hiveId, originType: "purchased", startedAt: hace(90), provenanceClass: "direct_observation" })
    ).id;
  }

  it("declarar el cambio en la inspección abre el intervalo, en la fecha de la inspección", async () => {
    const colonyId = await colonia();
    const cuando = hace(2);
    const i = await recordInspection(operario, {
      colonyId, outcome: "nothing_unusual", occurredAt: cuando,
      cambiosDeConfiguracion: [{ kind: "excluidor", accion: "instalado" }],
    });
    const f = await prisma.hiveFitting.findFirstOrThrow({ where: { hiveId } });
    expect(f.kind).toBe("excluidor");
    expect(f.installedAt.toISOString()).toBe(cuando.toISOString());
    // El intervalo queda atado a la inspección que lo declaró.
    expect(f.installedInspectionId).toBe(i.id);
  }, 20000);

  it("una inspección SIN cambios no toca nada — la captura no cambia", async () => {
    // El guardia de la instrucción de Daniel. Si esta cae, alguien hizo
    // obligatorio declarar la configuración en cada visita, que es exactamente
    // «coste sin información».
    const colonyId = await colonia();
    const antes = await prisma.hiveFitting.count({ where: { hiveId } });
    const h0 = await prisma.hive.findUniqueOrThrow({ where: { id: hiveId } });
    await recordInspection(operario, { colonyId, outcome: "nothing_unusual" });
    expect(await prisma.hiveFitting.count({ where: { hiveId } })).toBe(antes);
    expect((await prisma.hive.findUniqueOrThrow({ where: { id: hiveId } })).queenExcluder).toBe(h0.queenExcluder);
  }, 20000);

  it("retirar en la inspección cierra el intervalo abierto y lo ata a esa inspección", async () => {
    const colonyId = await colonia();
    await instalarArtefacto(operario, { hiveId, kind: "reductor_de_piquera", installedAt: hace(20) });
    const i = await recordInspection(operario, {
      colonyId, outcome: "nothing_unusual", occurredAt: hace(1),
      cambiosDeConfiguracion: [{ kind: "reductor_de_piquera", accion: "retirado" }],
    });
    const f = await prisma.hiveFitting.findFirstOrThrow({ where: { hiveId } });
    expect(f.removedInspectionId).toBe(i.id);
    expect(await artefactosDeColmena(operario, hiveId)).toHaveLength(0);
  }, 20000);

  it("si el cambio es inválido, la inspección TAMPOCO se guarda — una sola transacción", async () => {
    const colonyId = await colonia();
    const antes = await prisma.inspection.count({ where: { colonyId } });
    await expect(
      recordInspection(operario, {
        colonyId, outcome: "nothing_unusual",
        cambiosDeConfiguracion: [{ kind: "alza", accion: "instalado" }], // sin cuenta
      }),
    ).rejects.toThrow(/cuenta_de_alzas/);
    expect(await prisma.inspection.count({ where: { colonyId } })).toBe(antes);
  }, 20000);

  it("un tipo que no existe se rechaza, y el nodo no se declara aquí", async () => {
    const colonyId = await colonia();
    await expect(
      recordInspection(operario, { colonyId, outcome: "nothing_unusual", cambiosDeConfiguracion: [{ kind: "cohete", accion: "instalado" }] }),
    ).rejects.toThrow(/artefacto_desconocido/);
    // El nodo tiene identidad y permiso propio: se instala por su pantalla, no con un toque.
    await expect(
      recordInspection(operario, { colonyId, outcome: "nothing_unusual", cambiosDeConfiguracion: [{ kind: "nodo_de_sensores", accion: "instalado" }] }),
    ).rejects.toThrow(/nodo_por_su_pantalla/);
  }, 20000);
});

describe("el booleano pasa a ser una caché con un solo escritor", () => {
  it("instalar un excluidor pone el booleano de la colmena", async () => {
    await cajaNueva();
    await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(1) });
    expect((await prisma.hive.findUniqueOrThrow({ where: { id: hiveId } })).queenExcluder).toBe(true);
  }, 20000);

  it("retirarlo lo apaga", async () => {
    await cajaNueva();
    const a = await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(5) });
    await retirarArtefacto(operario, { fittingId: a.id, removedAt: hace(1) });
    expect((await prisma.hive.findUniqueOrThrow({ where: { id: hiveId } })).queenExcluder).toBe(false);
  }, 20000);

  it("un artefacto que NO tiene booleano no toca los otros — lo no declarado sigue sin declarar", async () => {
    // ADR-080: un nulo es «nadie miró». Instalar un alimentador no afirma nada del excluidor.
    await cajaNueva();
    await instalarArtefacto(operario, { hiveId, kind: "alimentador", installedAt: hace(1) });
    const h = await prisma.hive.findUniqueOrThrow({ where: { id: hiveId } });
    expect(h.queenExcluder).toBeNull();
    expect(h.entranceReducer).toBeNull();
    expect(h.screenedBottomBoard).toBeNull();
  }, 20000);

  it("el formulario de la caja ya no escribe el booleano: abre o cierra el intervalo", async () => {
    // La segunda puerta que había. Marcar «sí» en la configuración es instalar hoy.
    await cajaNueva();
    await actualizarConfiguracionDeCaja(operario, { hiveId, queenExcluder: true });
    expect((await artefactosDeColmena(operario, hiveId)).map((a) => a.kind)).toEqual(["excluidor"]);
    await actualizarConfiguracionDeCaja(operario, { hiveId, queenExcluder: false });
    expect(await artefactosDeColmena(operario, hiveId)).toHaveLength(0);
    expect((await prisma.hive.findUniqueOrThrow({ where: { id: hiveId } })).queenExcluder).toBe(false);
  }, 20000);

  it("y el booleano NUNCA discrepa del intervalo — el guardia de la caché", async () => {
    // Una caché con dos escritores es una segunda fuente de verdad disfrazada.
    // Recorre los tres caminos que escriben y exige que digan lo mismo.
    await cajaNueva();
    await instalarArtefacto(operario, { hiveId, kind: "piso_ventilado", installedAt: hace(3) });
    await actualizarConfiguracionDeCaja(operario, { hiveId, queenExcluder: true, entranceReducer: false });
    const h = await prisma.hive.findUniqueOrThrow({ where: { id: hiveId } });
    const puestos = (await artefactosDeColmena(operario, hiveId)).map((a) => a.kind);
    expect(h.screenedBottomBoard).toBe(puestos.includes("piso_ventilado"));
    expect(h.queenExcluder).toBe(puestos.includes("excluidor"));
    expect(h.entranceReducer ?? false).toBe(puestos.includes("reductor_de_piquera"));
  }, 20000);

  it("cada cambio de la foto queda auditado sobre la colmena, con su antes", async () => {
    await cajaNueva();
    await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(1) });
    const ev = await prisma.auditEvent.findFirst({ where: { entityType: "hive", entityId: hiveId, operation: "hive.fittings_snapshot" } });
    expect(ev).not.toBeNull();
    expect((ev!.before as { queenExcluder: boolean | null }).queenExcluder).toBeNull();
    expect((ev!.after as { queenExcluder: boolean | null }).queenExcluder).toBe(true);
  }, 20000);
});

describe("la historia, para la pantalla de la colmena", () => {
  it("trae lo puesto Y lo retirado, lo más nuevo primero", async () => {
    await cajaNueva();
    const viejo = await instalarArtefacto(operario, { hiveId, kind: "reductor_de_piquera", installedAt: hace(20) });
    await retirarArtefacto(operario, { fittingId: viejo.id, removedAt: hace(10) });
    await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(5) });
    const h = await historiaDeArtefactos(operario, hiveId);
    expect(h.map((f) => f.kind)).toEqual(["excluidor", "reductor_de_piquera"]);
    expect(h[1]!.removedAt).not.toBeNull();
  }, 20000);

  it("quien no ve el apiario no ve su historia — y el control positivo", async () => {
    await cajaNueva();
    await expect(historiaDeArtefactos(ajeno, hiveId)).rejects.toThrow(ApiaryAccessError);
    await expect(historiaDeArtefactos(operario, hiveId)).resolves.toEqual([]);
  }, 20000);
});
