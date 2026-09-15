/**
 * El mismo manejo aplicado a varias colmenas de una vez (ADR-136).
 *
 * Lo pidió el dueño con estas palabras: *«poder seleccionar todas las colmenas para aplicar
 * que se hizo algo que hice igual a todas, y no tener que hacer siempre una por una»*.
 *
 * Lo que estas pruebas defienden no es el ahorro de toques —eso se ve solo— sino las cuatro
 * cosas que NO se relajan por ser en lote: una fila por colonia, un rastro por fila, las
 * mismas reglas del evento individual, y que una caja sin abejas no reciba nada.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createColony, createHive } from "../../lib/apiary/hives";
import {
  ColonyEventValidationError,
  EventoEnLoteInvalido,
  registrarEventoEnLote,
} from "../../lib/apiary/colonyEvents";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `lote-${Date.now()}`;
const AHORA = new Date("2026-09-15T14:00:00Z");

describe("ADR-136 — el manejo en lote", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let otroLocationId: string;
  let userAccountId: string;
  let personId: string;
  let vivas: string[] = [];
  let muerta: string;
  let identificadorDeLaMuerta: string;
  let coloniaDeOtroSitio: string;

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = organization.id;
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Lote", displayName: `TEST Lote (${RUN_ID})`, locale: "es" },
    });
    personId = person.id;
    userAccountId = (
      await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })
    ).id;
    projectId = (
      await prisma.project.create({ data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" } })
    ).id;
    locationId = (
      await prisma.location.create({
        data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
      })
    ).id;
    otroLocationId = (
      await prisma.location.create({
        data: { locationType: "apiary_site", name: `TEST Otro Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
      })
    ).id;

    const farmOperator = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperator.id, scopeId: scope.id } });

    for (let i = 0; i < 3; i++) {
      const hive = await createHive(userAccountId, { projectId, locationId, identifier: `L${i}-${RUN_ID.slice(-5)}` });
      const colony = await createColony(userAccountId, {
        hiveId: hive.id,
        originType: "captured",
        startedAt: new Date("2026-01-01"),
        provenanceClass: "direct_observation",
      });
      vivas.push(colony.id);
    }

    // Una caja cuya colonia se acabó: el caso de NN-0041 y las diez de Toabré Finca 1.
    identificadorDeLaMuerta = `LX-${RUN_ID.slice(-5)}`;
    const hiveMuerta = await createHive(userAccountId, { projectId, locationId, identifier: identificadorDeLaMuerta });
    const cm = await createColony(userAccountId, {
      hiveId: hiveMuerta.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });
    muerta = cm.id;
    await prisma.colony.update({ where: { id: cm.id }, data: { status: "dead", endedAt: new Date("2026-06-01") } });

    const hiveOtro = await createHive(userAccountId, { projectId, locationId: otroLocationId, identifier: `LO-${RUN_ID.slice(-5)}` });
    coloniaDeOtroSitio = (
      await createColony(userAccountId, {
        hiveId: hiveOtro.id,
        originType: "captured",
        startedAt: new Date("2026-01-01"),
        provenanceClass: "direct_observation",
      })
    ).id;
  });

  afterAll(async () => {
    const colonias = await prisma.colony.findMany({
      where: assertDefinedWhere({ hive: { locationId: { in: [locationId, otroLocationId] } } }),
      select: { id: true },
    });
    const ids = colonias.map((c) => c.id);
    const eventos = await prisma.colonyEvent.findMany({ where: assertDefinedWhere({ colonyId: { in: ids } }), select: { id: true } });
    await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ colonyEventId: { in: eventos.map((e) => e.id) } }) });
    await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ locationId: { in: [locationId, otroLocationId] } }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId: { in: [locationId, otroLocationId] } } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId: { in: [locationId, otroLocationId] } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [locationId, otroLocationId] } }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("escribe UNA fila por colonia, con los mismos datos y la misma fecha", async () => {
    const r = await registrarEventoEnLote(userAccountId, {
      colonyIds: vivas,
      eventType: "feeding",
      occurredAt: AHORA,
      feedingMaterial: "jarabe 1:1",
      feedingQuantity: 1.5,
      feedingUnit: "L",
      feedingMethod: "bolsa_sobre_cabezales",
      coverageUntil: new Date("2026-10-01T00:00:00Z"),
      loteDeClienteId: `${RUN_ID}-a`,
    });

    expect(r.escritos).toBe(3);
    expect(r.yaEstaban).toBe(0);
    const filas = await prisma.colonyEvent.findMany({ where: { id: { in: r.colonyEventIds } } });
    expect(filas).toHaveLength(3);
    // La fecha que dispara el aviso es LA MISMA en las tres: es el argumento del lote.
    expect([...new Set(filas.map((f) => f.coverageUntil?.toISOString()))]).toEqual(["2026-10-01T00:00:00.000Z"]);
    expect([...new Set(filas.map((f) => f.occurredAt.toISOString()))]).toHaveLength(1);
    // Una fila por colonia, no una fila por lote.
    expect([...new Set(filas.map((f) => f.colonyId))].sort()).toEqual([...vivas].sort());
  });

  it("deja un AuditEvent por fila, no uno por lote", async () => {
    const r = await registrarEventoEnLote(userAccountId, {
      colonyIds: vivas,
      eventType: "treatment",
      occurredAt: AHORA,
      treatmentProduct: "Apivar",
      treatmentBatchLabel: `L-${RUN_ID.slice(-4)}`,
      treatmentWithdrawalDays: 14,
      treatmentTarget: "varroa",
      loteDeClienteId: `${RUN_ID}-b`,
    });
    const eventos = await prisma.auditEvent.findMany({
      where: { entityType: "colony_event", entityId: { in: r.colonyEventIds } },
      select: { entityId: true, operation: true, reason: true },
    });
    expect(eventos).toHaveLength(3);
    expect(new Set(eventos.map((e) => e.entityId)).size).toBe(3);
    expect(eventos.every((e) => e.operation === "colony_event.create")).toBe(true);
    expect(eventos[0]!.reason).toMatch(/lote a 3 colmena/);
  });

  it("una colonia que ya no está viva NO recibe nada, y el error dice cuál", async () => {
    // Es el caso real: doce cajas vacías entre Finca Rosina y Toabré Finca 1.
    const antes = await prisma.colonyEvent.count({ where: { colonyId: muerta } });
    await expect(
      registrarEventoEnLote(userAccountId, {
        colonyIds: [...vivas, muerta],
        eventType: "feeding",
        occurredAt: AHORA,
        feedingMaterial: "jarabe 1:1",
      }),
    ).rejects.toThrow(EventoEnLoteInvalido);
    // Y aborta ENTERO: ninguna de las vivas recibió tampoco.
    expect(await prisma.colonyEvent.count({ where: { colonyId: muerta } })).toBe(antes);
    try {
      await registrarEventoEnLote(userAccountId, {
        colonyIds: [muerta],
        eventType: "feeding",
        occurredAt: AHORA,
        feedingMaterial: "jarabe 1:1",
      });
      throw new Error("tenía que haber fallado");
    } catch (e) {
      expect((e as EventoEnLoteInvalido).message).toBe("colonia_no_viva");
      expect((e as EventoEnLoteInvalido).detalles).toEqual([identificadorDeLaMuerta]);
    }
  });

  it("no mezcla colmenas de dos sitios: un lote es una vuelta por UN apiario", async () => {
    await expect(
      registrarEventoEnLote(userAccountId, {
        colonyIds: [vivas[0]!, coloniaDeOtroSitio],
        eventType: "feeding",
        occurredAt: AHORA,
        feedingMaterial: "jarabe 1:1",
      }),
    ).rejects.toThrow(/colmenas_de_varios_sitios/);
  });

  it("la inspección y la observación NO entran por aquí, y el esquema es quien traza la línea", async () => {
    // `feeding` y `treatment` son `original_record` —algo que HICISTE—; los otros dos son
    // `direct_observation`. Diez registros de una acción son ciertos; diez observaciones
    // sacadas de una mirada, no.
    for (const tipo of ["passing_observation", "other"] as const) {
      await expect(
        registrarEventoEnLote(userAccountId, { colonyIds: vivas, eventType: tipo, occurredAt: AHORA }),
      ).rejects.toThrow(/tipo_no_admite_lote/);
    }
  });

  it("las reglas del evento individual valen igual en lote — una sola fuente", async () => {
    // Si esto deja de fallar, es que las reglas se duplicaron y una de las dos puertas se
    // quedó atrás. Un tratamiento sin carencia se rechaza en las dos.
    await expect(
      registrarEventoEnLote(userAccountId, {
        colonyIds: vivas,
        eventType: "treatment",
        occurredAt: AHORA,
        treatmentProduct: "Apivar",
        treatmentBatchLabel: "L-1",
        treatmentTarget: "varroa",
      }),
    ).rejects.toThrow(ColonyEventValidationError);
  });

  it("el mismo lote dos veces escribe UNA vez, y lo dice", async () => {
    const entrada = {
      colonyIds: vivas,
      eventType: "feeding" as const,
      occurredAt: AHORA,
      feedingMaterial: "jarabe 2:1",
      loteDeClienteId: `${RUN_ID}-idem`,
    };
    const primera = await registrarEventoEnLote(userAccountId, entrada);
    const segunda = await registrarEventoEnLote(userAccountId, entrada);
    expect(primera.escritos).toBe(3);
    expect(segunda.escritos).toBe(0);
    expect(segunda.yaEstaban).toBe(3);
    const total = await prisma.colonyEvent.count({
      where: { colonyId: { in: vivas }, feedingMaterial: "jarabe 2:1" },
    });
    expect(total, "tres filas, no seis").toBe(3);
  });

  it("sin colmenas es un error, no un silencio", async () => {
    await expect(
      registrarEventoEnLote(userAccountId, { colonyIds: [], eventType: "feeding", occurredAt: AHORA }),
    ).rejects.toThrow(/sin_colmenas/);
  });
});
