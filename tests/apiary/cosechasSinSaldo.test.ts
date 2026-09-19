/**
 * ADR-166 — las cosechas pesadas cuyo lote quedó sin saldo, y el acto de asentarlo, contra
 * Postgres.
 *
 * **El estado viejo se simula como quedó en producción**: una cosecha sin peso al cosechar, y el
 * peso escrito después DIRECTAMENTE en la fila —que es lo que hacía el cierre antes de ADR-161—,
 * sin ningún asiento en el libro del lote.
 *
 * Grupo `base-sembrada`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony } from "../../lib/apiary/hives";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { asentarPesoDeCosecha, cosechasSinSaldo } from "../../lib/apiary/cosechasSinSaldo";
import { computeCurrentQuantity } from "../../lib/traceability/quantity";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `css-${Date.now()}`;

describe("las cosechas pesadas sin saldo", () => {
  let organizationId: string;
  let projectId: string;
  const locationIds: string[] = [];
  let apiario: string;
  let otroApiario: string;
  let userAccountId: string;
  let sinAcceso: string;
  let scopeId: string;
  const personIds: string[] = [];
  let colonia: string;
  let coloniaAjena: string;

  async function crearCuenta(etiqueta: string) {
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN_ID})`, locale: "es" },
    });
    personIds.push(person.id);
    return (await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })).id;
  }

  async function sitio(nombre: string) {
    const id = (
      await prisma.location.create({
        data: { locationType: "apiary_site", name: `TEST ${nombre} (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
      })
    ).id;
    locationIds.push(id);
    return id;
  }

  async function coloniaEn(locationId: string, id: string) {
    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `S-${id}` });
    return (
      await createColony(userAccountId, { hiveId: hive.id, originType: "captured", startedAt: new Date("2026-01-01"), provenanceClass: "direct_observation" })
    ).id;
  }

  /** Una cosecha «vieja»: el peso va a la fila, y el libro del lote queda vacío. */
  let n = 0;
  async function cosechaVieja(colonyId: string, kg: number | null) {
    n += 1;
    const { harvestEvent, lot } = await recordApiaryHarvest(userAccountId, {
      colonyId, lotCode: `MIEL-${RUN_ID.slice(-6)}-${n}`, occurredAt: new Date("2026-08-20T09:00:00Z"),
      framesHarvested: 4, provenanceClass: "direct_observation",
    });
    if (kg !== null) await prisma.apiaryHarvestEvent.update({ where: { id: harvestEvent.id }, data: { extractedWeightKg: kg } });
    return { harvestEvent, lot };
  }

  const saldo = async (lotId: string) => {
    const q = await computeCurrentQuantity(userAccountId, lotId);
    return q.recorded ? Number(q.quantity) : null;
  };

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" } })
    ).id;
    projectId = (await prisma.project.create({ data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" } })).id;
    apiario = await sitio("Apiario");
    otroApiario = await sitio("Otro");
    userAccountId = await crearCuenta("Saldo");
    sinAcceso = await crearCuenta("SaldoSinAcceso");
    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    scopeId = (await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } })).id;
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId } });
    colonia = await coloniaEn(apiario, `${RUN_ID.slice(-4)}a`);
    coloniaAjena = await coloniaEn(otroApiario, `${RUN_ID.slice(-4)}b`);
  });

  afterEach(async () => {
    const cosechas = await prisma.apiaryHarvestEvent.findMany({ where: { colonyId: { in: [colonia, coloniaAjena] } }, select: { resultingLotId: true } });
    const lotes = cosechas.map((c) => c.resultingLotId);
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: [userAccountId, sinAcceso] } }) });
    await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
    await prisma.apiaryHarvestEvent.deleteMany({ where: assertDefinedWhere({ colonyId: { in: [colonia, coloniaAjena] } }) });
    await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  });

  afterAll(async () => {
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: [colonia, coloniaAjena] } }) });
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId: { in: locationIds } } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [userAccountId, sinAcceso] } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [userAccountId, sinAcceso] } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("LO QUE EL DUEÑO PIDIÓ: la cosecha vieja aparece, se asienta su peso, y deja de aparecer", async () => {
    const { harvestEvent, lot } = await cosechaVieja(colonia, 27.5);
    expect(await saldo(lot.id)).toBeNull();
    expect((await cosechasSinSaldo(apiario)).map((c) => [c.id, c.extractedWeightKg])).toEqual([[harvestEvent.id, 27.5]]);

    await asentarPesoDeCosecha(userAccountId, harvestEvent.id);
    expect(await saldo(lot.id)).toBe(27.5);
    expect(await cosechasSinSaldo(apiario)).toEqual([]);
    const asiento = await prisma.quantityEvent.findFirstOrThrow({ where: { lotId: lot.id } });
    // Con la fecha de la COSECHA, no la de hoy: es cuando entró la miel.
    expect([asiento.eventType, asiento.occurredAt.toISOString()]).toEqual(["received", "2026-08-20T09:00:00.000Z"]);
    expect(await prisma.auditEvent.count({ where: { entityId: asiento.id, operation: "apiary_harvest.backfill_ledger" } })).toBe(1);
  });

  it("NO SE ASIENTA DOS VECES", async () => {
    const { harvestEvent, lot } = await cosechaVieja(colonia, 10);
    await asentarPesoDeCosecha(userAccountId, harvestEvent.id);
    await expect(asentarPesoDeCosecha(userAccountId, harvestEvent.id)).rejects.toThrow(/el_lote_ya_tiene_saldo/);
    expect(await saldo(lot.id)).toBe(10);
  });

  it("UN LOTE CON CUALQUIER ASIENTO no se ofrece: ya tiene historia y podría contarse dos veces", async () => {
    const { harvestEvent, lot } = await cosechaVieja(colonia, 12);
    await prisma.quantityEvent.create({
      data: { lotId: lot.id, eventType: "adjustment_increase", quantity: 1, unit: "kg", occurredAt: new Date("2026-08-21"), provenanceClass: "original_record" },
    });
    expect(await cosechasSinSaldo(apiario)).toEqual([]);
    await expect(asentarPesoDeCosecha(userAccountId, harvestEvent.id)).rejects.toThrow(/el_lote_ya_tiene_saldo/);
  });

  it("UNA COSECHA SIN PESO no se ofrece: no hay número que asentar", async () => {
    const { harvestEvent } = await cosechaVieja(colonia, null);
    expect(await cosechasSinSaldo(apiario)).toEqual([]);
    await expect(asentarPesoDeCosecha(userAccountId, harvestEvent.id)).rejects.toThrow(/cosecha_sin_peso/);
  });

  it("CADA APIARIO VE LAS SUYAS: la cosecha de otro sitio no sale en esta lista", async () => {
    const ajena = await cosechaVieja(coloniaAjena, 8);
    const propia = await cosechaVieja(colonia, 9);
    expect((await cosechasSinSaldo(apiario)).map((c) => c.id)).toEqual([propia.harvestEvent.id]);
    expect((await cosechasSinSaldo(otroApiario)).map((c) => c.id)).toEqual([ajena.harvestEvent.id]);
  });

  it("QUIEN NO TIENE EL APIARIO no asienta nada", async () => {
    const { harvestEvent, lot } = await cosechaVieja(colonia, 5);
    await expect(asentarPesoDeCosecha(sinAcceso, harvestEvent.id)).rejects.toThrow();
    expect(await saldo(lot.id)).toBeNull();
  });
});
