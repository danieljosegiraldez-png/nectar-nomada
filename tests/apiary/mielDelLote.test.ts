/**
 * ADR-161 — procesar y envasar un lote de miel, contra Postgres.
 *
 * **Lo que sólo se puede afirmar con la base:** que cada paso crea un lote nuevo con su
 * genealogía, que el libro de cantidades cuadra (lo que sale + la merma = lo que entró), que el
 * frasco envasado sabe de qué colonia salió, y que las reglas viven también en la base.
 *
 * Grupo `base-sembrada`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony } from "../../lib/apiary/hives";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { completarCierreDeCosecha } from "../../lib/apiary/cierreDeCosecha";
import { envasarMiel, procesarMiel } from "../../lib/apiary/mielDelLote";
import { computeCurrentQuantity } from "../../lib/traceability/quantity";
import { getLotDetail } from "../../lib/traceability/lots";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `mdl-${Date.now()}`;
const DIA = new Date("2026-09-12T00:00:00Z");

describe("los pasos de un lote de miel", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let otroUserAccountId: string;
  let scopeId: string;
  const personIds: string[] = [];
  let colonyId: string;
  let hiveIdentifier: string;
  const lotes: string[] = [];

  async function crearCuenta(etiqueta: string) {
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN_ID})`, locale: "es" },
    });
    personIds.push(person.id);
    return (await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })).id;
  }

  /** Una cosecha SIN peso, cerrada después con `kg`: el camino normal —se pesa al extraer—. */
  let n = 0;
  async function cosechaCerrada(kg: number) {
    n += 1;
    const { harvestEvent, lot } = await recordApiaryHarvest(userAccountId, {
      colonyId,
      lotCode: `MIEL-${RUN_ID.slice(-6)}-${n}`,
      occurredAt: new Date("2026-09-01T09:00:00Z"),
      framesHarvested: 6,
      provenanceClass: "direct_observation",
    });
    lotes.push(lot.id);
    await completarCierreDeCosecha(userAccountId, { apiaryHarvestEventId: harvestEvent.id, extractedWeightKg: kg });
    return { harvestEvent, lot };
  }

  const saldo = async (lotId: string) => {
    const q = await computeCurrentQuantity(userAccountId, lotId);
    return q.recorded ? Number(q.quantity) : null;
  };

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.create({
        data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
      })
    ).id;
    projectId = (
      await prisma.project.create({ data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" } })
    ).id;
    locationId = (
      await prisma.location.create({
        data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
      })
    ).id;
    userAccountId = await crearCuenta("Miel");
    otroUserAccountId = await crearCuenta("MielSinAcceso");
    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    scopeId = (await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } })).id;
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId } });
    hiveIdentifier = `M-${RUN_ID.slice(-4)}`;
    const hive = await createHive(userAccountId, { projectId, locationId, identifier: hiveIdentifier });
    colonyId = (
      await createColony(userAccountId, {
        hiveId: hive.id,
        originType: "captured",
        startedAt: new Date("2026-01-01"),
        provenanceClass: "direct_observation",
      })
    ).id;
  });

  afterEach(async () => {
    // En `afterEach`: una aserción que falla no se salta el borrado. Los lotes que salen de un
    // paso se buscan por la genealogía, no por lo que la prueba recordó crear.
    for (;;) {
      const hijos = await prisma.lotTransformationOutput.findMany({
        where: { transformation: { inputs: { some: { lotId: { in: lotes } } } }, lotId: { notIn: lotes } },
        select: { lotId: true },
      });
      if (hijos.length === 0) break;
      lotes.push(...hijos.map((h) => h.lotId));
    }
    const trans = (
      await prisma.lotTransformationInput.findMany({ where: assertDefinedWhere({ lotId: { in: lotes } }), select: { transformationId: true } })
    ).map((x) => x.transformationId);
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: [userAccountId, otroUserAccountId] } }) });
    await prisma.deviation.deleteMany({ where: assertDefinedWhere({ lotTransformationId: { in: trans } }) });
    await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
    await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: trans } }) });
    await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: trans } }) });
    await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: trans } }) });
    await prisma.apiaryHarvestEvent.deleteMany({ where: assertDefinedWhere({ colonyId }) });
    await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
    lotes.length = 0;
  });

  afterAll(async () => {
    const colonias = await prisma.colony.findMany({ where: { hive: { locationId } }, select: { id: true } });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias.map((c) => c.id) } }) });
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [userAccountId, otroUserAccountId] } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [userAccountId, otroUserAccountId] } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("EL PESO DEL CIERRE ENTRA EN EL LIBRO: sin esto, la miel no tenía contra qué cuadrar", async () => {
    const { harvestEvent, lot } = await cosechaCerrada(30);
    expect(await saldo(lot.id)).toBe(30);
    // Corregir asienta SÓLO la diferencia, y el asiento original se queda.
    await completarCierreDeCosecha(userAccountId, { apiaryHarvestEventId: harvestEvent.id, extractedWeightKg: 28, reason: "báscula mal tarada" });
    expect(await saldo(lot.id)).toBe(28);
    const tipos = (await prisma.quantityEvent.findMany({ where: { lotId: lot.id }, orderBy: { createdAt: "asc" } })).map((e) => [e.eventType, Number(e.quantity)]);
    expect(tipos).toEqual([["received", 30], ["adjustment_decrease", 2]]);
  });

  it("LO QUE EL DUEÑO PIDIÓ: procesar parte del lote crea un lote NUEVO, y el libro cuadra", async () => {
    const { lot } = await cosechaCerrada(30);
    const r = await procesarMiel(userAccountId, {
      lotId: lot.id, occurredAt: DIA, acts: ["decantacion_maduracion", "colado"], inputKg: 20, outputKg: 19.4, lossKg: 0.6,
      provenanceClass: "measured_fact",
    });
    // Se lee de LAS FILAS.
    const t = await prisma.lotTransformation.findUniqueOrThrow({ where: { id: r.transformation.id } });
    expect([t.transformationType, t.honeyProcessActs]).toEqual(["honey_processing", ["colado", "decantacion_maduracion"]]);
    const hijo = await prisma.lot.findUniqueOrThrow({ where: { id: r.lote.id } });
    expect([hijo.lotType, hijo.lotCode]).toEqual(["honey", `${lot.lotCode}-A`]);
    expect(await saldo(lot.id)).toBe(10);
    expect(await saldo(hijo.id)).toBe(19.4);
    expect(Number(t.unexplainedQuantity ?? 0)).toBe(0);
    expect(await prisma.deviation.count({ where: { lotTransformationId: t.id } })).toBe(0);
  });

  it("ENVASAR: envases × masa neta, y el frasco sabe de qué caja salió", async () => {
    const { lot, harvestEvent } = await cosechaCerrada(30);
    const p = await procesarMiel(userAccountId, {
      lotId: lot.id, occurredAt: DIA, acts: ["colado"], inputKg: 30, outputKg: 29.5, lossKg: 0.5, provenanceClass: "measured_fact",
    });
    const e = await envasarMiel(userAccountId, {
      lotId: p.lote.id, occurredAt: DIA, inputKg: 19.2, packageCount: 38, packageNetMassG: 500, lossKg: 0.2,
      provenanceClass: "measured_fact",
    });
    expect(e.envasadoKg).toBe(19);
    const t = await prisma.lotTransformation.findUniqueOrThrow({ where: { id: e.transformation.id } });
    expect([t.transformationType, t.packageCount, Number(t.packageNetMassG)]).toEqual(["packaging", 38, 500]);
    expect(await saldo(e.lote.id)).toBe(19);
    // La genealogía, dos pasos hacia arriba: el lote envasado NO es el de la cosecha.
    const detalle = await getLotDetail(userAccountId, e.lote.id);
    expect(detalle.origenApicola.map((o) => [o.id, o.colony.hive.identifier])).toEqual([[harvestEvent.id, hiveIdentifier]]);
  });

  it("NO SE TOMA MÁS DE LO QUE HAY", async () => {
    const { lot } = await cosechaCerrada(10);
    await expect(
      procesarMiel(userAccountId, { lotId: lot.id, occurredAt: DIA, acts: ["colado"], inputKg: 12, outputKg: 12, provenanceClass: "measured_fact" }),
    ).rejects.toThrow(/input_exceeds_available/);
  });

  it("LO QUE NO CUADRA NO SE ESCONDE: queda como desviación, no se rechaza", async () => {
    // La miel ya se procesó: rechazar el registro no la devuelve al tanque. Se guarda y se dice.
    const { lot } = await cosechaCerrada(30);
    const r = await procesarMiel(userAccountId, {
      lotId: lot.id, occurredAt: DIA, acts: ["filtrado"], inputKg: 30, outputKg: 20, provenanceClass: "measured_fact",
    });
    expect(await prisma.deviation.count({ where: { lotTransformationId: r.transformation.id } })).toBe(1);
  });

  it("UN LOTE QUE NO ES MIEL no se procesa como miel", async () => {
    const cereza = await prisma.lot.create({ data: { lotCode: `CER-${RUN_ID}`, lotType: "cherry", organizationId, projectId, locationId } });
    lotes.push(cereza.id);
    await expect(
      procesarMiel(userAccountId, { lotId: cereza.id, occurredAt: DIA, acts: ["colado"], inputKg: 1, outputKg: 1, provenanceClass: "measured_fact" }),
    ).rejects.toThrow(/el_lote_no_es_miel/);
    // Y a quien no tiene acceso, ni eso: se autoriza ANTES de decir de qué es el lote.
    await expect(
      procesarMiel(otroUserAccountId, { lotId: cereza.id, occurredAt: DIA, acts: ["colado"], inputKg: 1, outputKg: 1, provenanceClass: "measured_fact" }),
    ).rejects.toThrow(/no_lot_access/);
  });

  it("quien NO tiene acceso al lote no lo procesa, y no se entera de si es miel", async () => {
    const { lot } = await cosechaCerrada(5);
    await expect(
      procesarMiel(otroUserAccountId, { lotId: lot.id, occurredAt: DIA, acts: ["colado"], inputKg: 1, outputKg: 1, provenanceClass: "measured_fact" }),
    ).rejects.toThrow(/no_lot_access/);
    expect(await prisma.lotTransformationInput.count({ where: { lotId: lot.id } })).toBe(0);
  });

  it("LAS REGLAS VIVEN EN LA BASE: cada CHECK rechaza lo suyo, y lo válido entra", async () => {
    // Una sonda por regla, dentro de una transacción que se deshace SIEMPRE. El control
    // positivo —la fila válida— es lo que prueba que las otras no fallan por otra razón.
    async function sonda(tipo: string, extra: string): Promise<string> {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `INSERT INTO traceability.lot_transformation (transformation_type, occurred_at, provenance_class${extra ? ", " + extra.split("=")[0] : ""})
             VALUES ('${tipo}', now(), 'measured_fact'${extra ? ", " + extra.split("=")[1] : ""})`,
          );
          throw new Error("DESHACER");
        });
      } catch (e) {
        const m = (e as Error).message;
        if (m.includes("DESHACER")) return "entra";
        const c = m.match(/lot_transformation_[a-z_]+/);
        return c ? c[0] : m.slice(0, 120);
      }
      return "?";
    }
    const acts = (v: string) => `honey_process_acts=ARRAY[${v}]::traceability."HoneyProcessAct"[]`;
    expect(await sonda("honey_processing", acts("'colado'"))).toBe("entra");
    expect(await sonda("honey_processing", "")).toBe("lot_transformation_actos_de_miel");
    expect(await sonda("stage_change", acts("'colado'"))).toBe("lot_transformation_actos_de_miel");
    expect(await sonda("honey_processing", acts("'otro'"))).toBe("lot_transformation_otro_acto_dice_cual");
    expect(await sonda("packaging", "")).toBe("lot_transformation_envasado_completo");
    expect(await sonda("stage_change", "package_count=3")).toBe("lot_transformation_envasado_completo");
  });
});
