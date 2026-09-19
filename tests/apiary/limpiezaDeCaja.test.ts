/**
 * ADR-159 — la limpieza de la CAJA, contra Postgres.
 *
 * **Lo que sólo se puede afirmar con la base:** que la regla de «caja vacía» mira la ocupación
 * **en la fecha de la limpieza** y no hoy, y que no bloquea el caso más común de todos — limpiar
 * la caja después de que la colonia muriera.
 *
 * Grupo `base-sembrada`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearApiario, createHive, createColony } from "../../lib/apiary/hives";
import { registrarLimpiezaDeCaja, limpiezasDeCaja } from "../../lib/apiary/limpiezaDeCaja";

const RUN = `a9-lc-${Date.now()}`;
const D = (s: string) => new Date(`${s}T12:00:00Z`);

describe("la limpieza de la caja", () => {
  let userAccountId: string;
  let otroUserAccountId: string;
  let apiarioId: string;
  let organizationId: string;
  const cajas: string[] = [];

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.create({
        data: { organizationType: "farm", name: `TEST Farm (${RUN})`, status: "approved", classification: "internal" },
      })
    ).id;
    const persona = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Lc", displayName: `TEST Lc (${RUN})`, locale: "es" },
    });
    userAccountId = (
      await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })
    ).id;
    // Una segunda cuenta SIN asignación: el control de que el permiso de verdad se comprueba.
    const otra = await prisma.person.create({
      data: { givenName: "TEST", familyName: "LcOtro", displayName: `TEST LcOtro (${RUN})`, locale: "es" },
    });
    otroUserAccountId = (
      await prisma.userAccount.create({ data: { personId: otra.id, authProvider: "credentials", status: "active" } })
    ).id;

    // El ámbito de plataforma se REUSA, nunca se crea ni se borra: es compartido.
    const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
    const scope =
      (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
      (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: admin.id, scopeId: scope.id } });

    apiarioId = (await crearApiario(userAccountId, { name: `TEST Apiario (${RUN})`, organizationId })).id;
  });

  async function cajaNueva(sufijo: string) {
    const c = await createHive(userAccountId, { identifier: `${RUN}-${sufijo}`, locationId: apiarioId });
    cajas.push(c.id);
    return c.id;
  }

  afterEach(async () => {
    // En `afterEach`: una aserción que falla no se salta el borrado (la fuga de polinizacion).
    for (const hiveId of cajas) {
      const ids = (await prisma.hiveCleaning.findMany({ where: assertDefinedWhere({ hiveId }), select: { id: true } })).map((f) => f.id);
      if (ids.length) await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: ids } }) });
      await prisma.hiveCleaning.deleteMany({ where: assertDefinedWhere({ hiveId }) });
    }
  });

  // Borra TODO lo que la corrida crea, no sólo las colonias: hasta el 2026-09-18 dejaba en la
  // base compartida su apiario, sus diez cajas, dos personas y la organización en cada corrida
  // — 18 apiarios acumulados, que empujaban hacia el tope de `getApiaryList` a meliponario.test.ts
  // (PENDING_IMPLEMENTATIONS/012). Mismo orden que altaEnLote.test.ts.
  afterAll(async () => {
    const colonias = await prisma.colony.findMany({
      where: assertDefinedWhere({ hive: { locationId: apiarioId } }),
      select: { id: true },
    });
    if (colonias.length) {
      await prisma.auditEvent.deleteMany({
        where: assertDefinedWhere({ entityType: "colony", entityId: { in: colonias.map((c) => c.id) } }),
      });
      await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias.map((c) => c.id) } }) });
    }
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId: apiarioId } }) });
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "hive", entityId: { in: cajas } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId: apiarioId }) });
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "location", entityId: apiarioId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: apiarioId }) });
    // El ámbito de plataforma NO se borra: es compartido y no es mío.
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [userAccountId, otroUserAccountId] } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("LO QUE EL DUEÑO PIDIÓ: una caja vacía se limpia, y el registro cuelga DE LA CAJA", async () => {
    const hiveId = await cajaNueva("vacia");
    const f = await registrarLimpiezaDeCaja(userAccountId, {
      hiveId,
      occurredAt: D("2026-09-10"),
      acts: ["raspado", "flameado"],
      reason: "baja_de_colonia",
      provenanceClass: "original_record",
    });
    // Se lee de LA FILA, no del valor devuelto.
    const fila = await prisma.hiveCleaning.findUniqueOrThrow({ where: { id: f.id } });
    expect(fila.hiveId).toBe(hiveId);
    expect(fila.acts).toEqual(["raspado", "flameado"]);
    expect(fila.reason).toBe("baja_de_colonia");
    expect((await limpiezasDeCaja(hiveId)).map((l) => l.id)).toEqual([f.id]);
  });

  it("FLAMEAR UNA CAJA CON COLONIA se rechaza: no se quema una caja con abejas dentro", async () => {
    const hiveId = await cajaNueva("ocupada");
    await createColony(userAccountId, {
      hiveId,
      startedAt: D("2026-09-01"),
      originType: "purchased",
      provenanceClass: "direct_observation",
    });
    await expect(
      registrarLimpiezaDeCaja(userAccountId, {
        hiveId,
        occurredAt: D("2026-09-10"),
        acts: ["flameado"],
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(/caja_con_colonia_en_esa_fecha/);
  });

  it("EL CASO MÁS COMÚN: limpiar DESPUÉS de que la colonia muriera se acepta", async () => {
    // Vigila el supuesto medido en el servicio: una colonia que deja de estar activa lleva
    // `endedAt`. Si la ocupación se leyera del `status` o de una fecha sin cerrar, esta limpieza
    // —la que más se hace— quedaría bloqueada.
    const hiveId = await cajaNueva("muerta");
    const c = await createColony(userAccountId, {
      hiveId,
      startedAt: D("2026-08-01"),
      originType: "purchased",
      provenanceClass: "direct_observation",
    });
    await prisma.colony.update({ where: { id: c.id }, data: { status: "dead", endedAt: D("2026-09-05") } });

    const f = await registrarLimpiezaDeCaja(userAccountId, {
      hiveId,
      occurredAt: D("2026-09-10"),
      acts: ["raspado", "inmersion_sosa", "aclarado", "secado_al_sol"],
      reason: "sospecha_de_enfermedad",
      provenanceClass: "original_record",
    });
    expect(f.acts).toHaveLength(4);
  });

  it("SE MIRA LA FECHA, NO HOY: una limpieza pasada vale aunque la caja tenga colonia nueva", async () => {
    // Quien registra una limpieza de hace dos semanas tiene que poder hacerlo aunque desde ayer
    // haya abejas otra vez.
    const hiveId = await cajaNueva("reocupada");
    await createColony(userAccountId, {
      hiveId,
      startedAt: D("2026-09-15"),
      originType: "purchased", // era "split": las divisiones ahora nacen con dividirColonia (spec 2026-09-18 §3); el origen no importa aquí
      provenanceClass: "direct_observation",
    });
    const f = await registrarLimpiezaDeCaja(userAccountId, {
      hiveId,
      occurredAt: D("2026-09-01"),
      acts: ["flameado"],
      provenanceClass: "original_record",
    });
    expect(f.hiveId).toBe(hiveId);
  });

  it("EL MISMO DÍA, 1: la colonia se va el día 10 a mediodía y la caja se limpia ese día", async () => {
    // La limpieza es un DÍA. Con una regla por instante, una limpieza anotada «el 10» se leería a
    // medianoche —con la colonia todavía dentro— y se rechazaría aunque se hiciera por la tarde.
    const hiveId = await cajaNueva("mismodia-sale");
    const c = await createColony(userAccountId, {
      hiveId,
      startedAt: D("2026-08-01"),
      originType: "purchased",
      provenanceClass: "direct_observation",
    });
    await prisma.colony.update({ where: { id: c.id }, data: { status: "absconded", endedAt: D("2026-09-10") } });
    await expect(
      registrarLimpiezaDeCaja(userAccountId, {
        hiveId,
        occurredAt: new Date("2026-09-10T00:00:00Z"),
        acts: ["flameado"],
        provenanceClass: "original_record",
      }),
    ).resolves.toBeDefined();
  });

  it("EL MISMO DÍA, 2: se limpia la caja el día 10 y ese mismo día entra una colonia nueva", async () => {
    // La transición inversa, igual de normal: desinfectar y volver a poblar en la misma jornada.
    const hiveId = await cajaNueva("mismodia-entra");
    await createColony(userAccountId, {
      hiveId,
      startedAt: new Date("2026-09-10T16:00:00Z"),
      originType: "purchased", // era "split": las divisiones ahora nacen con dividirColonia (spec 2026-09-18 §3); el origen no importa aquí
      provenanceClass: "direct_observation",
    });
    await expect(
      registrarLimpiezaDeCaja(userAccountId, {
        hiveId,
        occurredAt: new Date("2026-09-10T00:00:00Z"),
        acts: ["raspado", "flameado"],
        provenanceClass: "original_record",
      }),
    ).resolves.toBeDefined();
  });

  it("y se guarda el DÍA, aunque llegue con hora: una hora colada no cambia nada", async () => {
    const hiveId = await cajaNueva("normaliza");
    const f = await registrarLimpiezaDeCaja(userAccountId, {
      hiveId,
      occurredAt: new Date("2026-09-10T19:45:00Z"),
      acts: ["raspado"],
      provenanceClass: "original_record",
    });
    expect(f.occurredAt.toISOString()).toBe("2026-09-10T00:00:00.000Z");
  });

  it("LA EXCEPCIÓN: renovar cera CON la colonia dentro se acepta — es cuando se hace", async () => {
    const hiveId = await cajaNueva("cera");
    await createColony(userAccountId, {
      hiveId,
      startedAt: D("2026-09-01"),
      originType: "purchased",
      provenanceClass: "direct_observation",
    });
    const f = await registrarLimpiezaDeCaja(userAccountId, {
      hiveId,
      occurredAt: D("2026-09-10"),
      acts: ["renovacion_de_cera"],
      reason: "renovacion_programada",
      provenanceClass: "original_record",
    });
    expect(f.acts).toEqual(["renovacion_de_cera"]);
  });

  it("escribe su AuditEvent en la misma transacción", async () => {
    const hiveId = await cajaNueva("audit");
    const f = await registrarLimpiezaDeCaja(userAccountId, {
      hiveId,
      occurredAt: D("2026-09-10"),
      acts: ["raspado"],
      provenanceClass: "original_record",
    });
    const ev = await prisma.auditEvent.findMany({
      where: assertDefinedWhere({ entityId: f.id, operation: "hive_cleaning.create" }),
    });
    expect(ev).toHaveLength(1);
  });

  it("quien NO tiene acceso a la caja no puede registrar su limpieza", async () => {
    const hiveId = await cajaNueva("sinacceso");
    await expect(
      registrarLimpiezaDeCaja(otroUserAccountId, {
        hiveId,
        occurredAt: D("2026-09-10"),
        acts: ["raspado"],
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow();
    expect(await prisma.hiveCleaning.count({ where: assertDefinedWhere({ hiveId }) })).toBe(0);
  });
});
