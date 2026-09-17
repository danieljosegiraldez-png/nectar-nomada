/**
 * ADR-149 — el alta de colmenas en lote, contra Postgres.
 *
 * **El incidente:** el dueño abrió la aplicación en el apiario el 2026-09-16, los apiarios
 * salieron, y lo que faltaba era registrar **cinco colmenas en cada uno**. El único camino creaba
 * UNA: diez envíos para dos apiarios, tecleando el identificador cada vez.
 *
 * Lo puro —qué identificadores saldrían y qué se rechaza— va en
 * `tests/apiary/identificadoresDeLote.test.ts`. Aquí vive **lo único que no se puede afirmar sin
 * la base**: que el lote es todo-o-nada, que cada colmena nace con su colocación, y que un
 * identificador repetido lo rechaza entero sin dejar la mitad dentro.
 *
 * Grupo `base-sembrada`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearApiario } from "../../lib/apiary/hives";
import { altaDeColmenasEnLote } from "../../lib/apiary/altaEnLote";
import { AltaEnLoteInvalida } from "../../lib/apiary/identificadoresDeLote";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `lote-${Date.now()}`;

describe("alta en lote contra Postgres", () => {
  let organizationId: string;
  let userAccountId: string;
  let personId: string;
  let apiarioId: string;

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.create({
        data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
      })
    ).id;
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Lote", displayName: `TEST Lote (${RUN_ID})`, locale: "es" },
    });
    personId = person.id;
    userAccountId = (
      await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })
    ).id;

    // Ámbito de plataforma: se REUSA el que hay, nunca se crea ni se borra. Es una fila
    // compartida por toda la suite, y en la prueba del meliponario la FK de otra asignación fue
    // lo único que evitó llevarse el ámbito de otras sesiones.
    const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
    const scope =
      (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
      (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: admin.id, scopeId: scope.id } });

    apiarioId = (
      await crearApiario(userAccountId, { name: `TEST Apiario (${RUN_ID})`, organizationId })
    ).id;
  });

  afterAll(async () => {
    const sitios = [apiarioId].filter(Boolean);
    const colonias = await prisma.colony.findMany({
      where: assertDefinedWhere({ hive: { locationId: { in: sitios } } }),
      select: { id: true },
    });
    if (colonias.length) {
      await prisma.auditEvent.deleteMany({
        where: assertDefinedWhere({ entityType: "colony", entityId: { in: colonias.map((c) => c.id) } }),
      });
      await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias.map((c) => c.id) } }) });
    }
    const colmenas = await prisma.hive.findMany({
      where: assertDefinedWhere({ locationId: { in: sitios } }),
      select: { id: true },
    });
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId: { in: sitios } } }) });
    if (colmenas.length) {
      await prisma.auditEvent.deleteMany({
        where: assertDefinedWhere({ entityType: "hive", entityId: { in: colmenas.map((h) => h.id) } }),
      });
    }
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId: { in: sitios } }) });
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "location", entityId: { in: sitios } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: sitios } }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("LO QUE EL DUEÑO PIDIÓ: cinco colmenas de una vez, con su prefijo", async () => {
    const creadas = await altaDeColmenasEnLote(userAccountId, {
      locationId: apiarioId,
      prefijo: `${RUN_ID}-`,
      desde: 1,
      cuantas: 5,
    });
    expect(creadas).toHaveLength(5);
    // Se lee la FILA, no lo que devolvió el servicio.
    const enLaBase = await prisma.hive.findMany({
      where: assertDefinedWhere({ locationId: apiarioId }),
      orderBy: { identifier: "asc" },
      select: { identifier: true, status: true },
    });
    expect(enLaBase.map((h) => h.identifier)).toEqual([1, 2, 3, 4, 5].map((n) => `${RUN_ID}-0${n}`));
    expect(enLaBase.every((h) => h.status === "active")).toBe(true);
  });

  it("cada colmena nace con su colocación, igual que en el camino de una (ADR-135)", async () => {
    // Una colmena guardada sin colocación es el estado que aquel ADR vino a impedir, y un camino
    // nuevo que lo olvide lo reabre sin que nada se ponga rojo.
    const colmenas = await prisma.hive.findMany({
      where: assertDefinedWhere({ locationId: apiarioId }),
      select: { id: true, placements: { select: { locationId: true, endedAt: true } } },
    });
    expect(colmenas).toHaveLength(5);
    for (const h of colmenas) {
      expect(h.placements, h.id).toHaveLength(1);
      const [colocacion] = h.placements;
      // `toHaveLength` no estrecha el tipo, así que se afirma antes de leer: comparar contra un
      // `undefined` daría el mismo verde que comparar contra el valor bueno.
      expect(colocacion, h.id).toBeDefined();
      expect(colocacion!.locationId).toBe(apiarioId);
      // Abierta: la colocación con la que nace no tiene fin.
      expect(colocacion!.endedAt).toBeNull();
    }
  });

  it("y un AuditEvent por colmena, con la misma forma que el alta de una", async () => {
    const colmenas = await prisma.hive.findMany({
      where: assertDefinedWhere({ locationId: apiarioId }),
      select: { id: true },
    });
    const eventos = await prisma.auditEvent.findMany({
      where: assertDefinedWhere({ entityType: "hive", entityId: { in: colmenas.map((h) => h.id) } }),
      select: { entityId: true, operation: true },
    });
    // Agruparlos en uno solo haría que «quién creó esta colmena» no tuviera respuesta para las
    // dadas de alta en lote.
    expect(eventos).toHaveLength(5);
    expect(new Set(eventos.map((e) => e.operation))).toEqual(new Set(["hive.create"]));
    expect(new Set(eventos.map((e) => e.entityId))).toEqual(new Set(colmenas.map((h) => h.id)));
  });

  it("TODO O NADA: un identificador repetido rechaza el lote entero y no deja la mitad dentro", async () => {
    const antes = await prisma.hive.count({ where: assertDefinedWhere({ locationId: apiarioId }) });
    // El 03 ya existe del primer lote; los otros cuatro son nuevos.
    await expect(
      altaDeColmenasEnLote(userAccountId, { locationId: apiarioId, prefijo: `${RUN_ID}-`, desde: 3, cuantas: 5 }),
    ).rejects.toThrow(AltaEnLoteInvalida);
    const despues = await prisma.hive.count({ where: assertDefinedWhere({ locationId: apiarioId }) });
    // Sin la comprobación previa dentro de la transacción, `03` reventaría por clave única
    // DESPUÉS de haber creado las anteriores del lote.
    expect(despues).toBe(antes);
  });

  it("y dice CUÁLES están repetidos, no sólo que algo falló", async () => {
    await expect(
      altaDeColmenasEnLote(userAccountId, { locationId: apiarioId, prefijo: `${RUN_ID}-`, desde: 1, cuantas: 2 }),
    ).rejects.toThrow(new RegExp(`${RUN_ID}-01.*${RUN_ID}-02`));
  });

  it("la colonia sólo se crea si el dueño la declara, y entonces comparten origen", async () => {
    const creadas = await altaDeColmenasEnLote(userAccountId, {
      locationId: apiarioId,
      prefijo: `${RUN_ID}-c`,
      desde: 1,
      cuantas: 3,
      colonia: {
        originType: "purchased",
        startedAt: new Date("2026-09-16T00:00:00Z"),
        provenanceClass: "direct_observation",
      },
    });
    const colonias = await prisma.colony.findMany({
      where: assertDefinedWhere({ hiveId: { in: creadas.map((h) => h.id) } }),
      select: { originType: true, status: true, hiveId: true },
    });
    expect(colonias).toHaveLength(3);
    expect(colonias.every((c) => c.originType === "purchased")).toBe(true);
    expect(colonias.every((c) => c.status === "active")).toBe(true);
  });

  it("CONTROL NEGATIVO: sin declararla, las colmenas nacen VACÍAS", async () => {
    // Es la mitad que hace falsable lo anterior. Crear colonias de oficio obligaría a
    // inventarles un origen, y `originType` no tiene valor por omisión a propósito.
    const creadas = await altaDeColmenasEnLote(userAccountId, {
      locationId: apiarioId,
      prefijo: `${RUN_ID}-v`,
      desde: 1,
      cuantas: 2,
    });
    const colonias = await prisma.colony.count({
      where: assertDefinedWhere({ hiveId: { in: creadas.map((h) => h.id) } }),
    });
    expect(colonias).toBe(0);
  });
});
