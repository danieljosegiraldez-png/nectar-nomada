import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `mesq-${Date.now()}`;
let organizationId: string;
let parcelaId: string;
let materialId: string;
let consumableLotId: string;
let harvestLotId: string;
let harvestEventId: string;

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  const p = await prisma.location.create({
    data: { name: `TEST Parcela (${RUN_ID})`, locationType: "plot", classification: "internal", organizationId },
  });
  parcelaId = p.id;
  const m = await prisma.consumableMaterial.create({
    data: { organizationId, name: `Prod ${RUN_ID}`, defaultUnit: "l", isPlantProtection: true },
  });
  materialId = m.id;

  // Frasco real, para el control positivo de `marca_de_vencimiento_exige_frasco`.
  const lot = await prisma.consumableLot.create({
    data: { materialId, batchLabel: `Lote ${RUN_ID}`, receivedAt: new Date("2026-08-01T00:00:00Z") },
  });
  consumableLotId = lot.id;

  // Cosecha real, para ejercitar `harvest_withdrawal_flag_dias_no_negativos` —
  // el CHECK vive en una tabla que cuelga de HarvestEvent, y sin una fila real
  // la prueba no puede afirmar nada sobre él.
  const harvestLot = await prisma.lot.create({
    data: { lotCode: `TEST-${RUN_ID}`, lotType: "cherry", organizationId, locationId: parcelaId },
  });
  harvestLotId = harvestLot.id;
  const harvest = await prisma.harvestEvent.create({
    data: {
      locationId: parcelaId, organizationId, harvestedAt: new Date("2026-09-05T12:00:00Z"),
      resultingLotId: harvestLot.id, provenanceClass: "original_record",
    },
  });
  harvestEventId = harvest.id;
}, 30000);

afterAll(async () => {
  const ints = await prisma.plotIntervention.findMany({ where: { locationId: parcelaId }, select: { id: true } });
  const ids = ints.map((i) => i.id);
  // Las marcas de carencia van antes que la cosecha y la intervención que citan.
  await prisma.harvestWithdrawalFlag.deleteMany({ where: assertDefinedWhere({ interventionId: { in: ids } }) });
  await prisma.plotInterventionLine.deleteMany({ where: assertDefinedWhere({ interventionId: { in: ids } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ correctsId: { in: ids } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ id: harvestEventId }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: harvestLotId }) });
  await prisma.consumableLot.deleteMany({ where: assertDefinedWhere({ id: consumableLotId }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ organizationId }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: parcelaId }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

const intervencion = (over: Record<string, unknown> = {}) =>
  prisma.plotIntervention.create({
    data: {
      locationId: parcelaId, kind: "aplicacion", target: "broca",
      occurredAt: new Date("2026-09-01T15:00:00Z"), provenanceClass: "original_record", ...over,
    },
  });

describe("los CHECK del manejo fitosanitario viven en la base", () => {
  it("carencia negativa se rechaza; cero entra", async () => {
    const i = await intervencion();
    await expect(prisma.plotInterventionLine.create({ data: { interventionId: i.id, materialId, withdrawalDays: -1 } }))
      .rejects.toThrow(/plot_intervention_line_carencia_no_negativa/);
    const ok = await prisma.plotInterventionLine.create({ data: { interventionId: i.id, materialId, withdrawalDays: 0 } });
    expect(ok.withdrawalDays).toBe(0);
  });

  it("reentrada negativa se rechaza; nula entra y SIGUE nula", async () => {
    const i = await intervencion();
    await expect(prisma.plotInterventionLine.create({ data: { interventionId: i.id, materialId, reentryHours: -2 } }))
      .rejects.toThrow(/plot_intervention_line_reentrada_no_negativa/);
    const ok = await prisma.plotInterventionLine.create({ data: { interventionId: i.id, materialId } });
    expect(ok.reentryHours).toBeNull();
    expect(ok.withdrawalDays).toBeNull();
  });

  it("marca de vencimiento sin frasco se rechaza; con frasco entra", async () => {
    const i = await intervencion();
    await expect(prisma.plotInterventionLine.create({ data: { interventionId: i.id, materialId, lotExpiredAtApplication: true } }))
      .rejects.toThrow(/marca_de_vencimiento_exige_frasco/);
    const ok = await prisma.plotInterventionLine.create({
      data: { interventionId: i.id, materialId, consumableLotId, lotExpiredAtApplication: true },
    });
    expect(ok.lotExpiredAtApplication).toBe(true);
  });

  it("`otro` sin nota se rechaza; con nota entra", async () => {
    await expect(intervencion({ target: "otro" })).rejects.toThrow(/plot_intervention_otro_con_nota/);
    const ok = await intervencion({ target: "otro", targetNote: "hormiga arriera" });
    expect(ok.targetNote).toBe("hormiga arriera");
  });

  it("corrección sin motivo se rechaza; con motivo entra", async () => {
    const original = await intervencion();
    // Control positivo del bug de NULL (Ronda 1): el motivo OMITIDO —no sólo
    // en blanco— tiene que rechazarse. La forma vieja del CHECK
    // (`length(btrim(x)) > 0` sin `IS NOT NULL`) dejaba pasar este caso.
    await expect(intervencion({ correctsId: original.id }))
      .rejects.toThrow(/plot_intervention_correccion_con_motivo/);
    await expect(intervencion({ correctsId: original.id, correctionReason: "  " }))
      .rejects.toThrow(/plot_intervention_correccion_con_motivo/);
    const ok = await intervencion({ correctsId: original.id, correctionReason: "la hora era otra" });
    expect(ok.correctsId).toBe(original.id);
  });

  it("reentrada por defecto negativa en el producto se rechaza; cero entra", async () => {
    await expect(prisma.consumableMaterial.create({
      data: { organizationId, name: `Neg ${RUN_ID}`, defaultUnit: "l", defaultReentryHours: -1 },
    })).rejects.toThrow(/consumable_material_reentrada_no_negativa/);
    const ok = await prisma.consumableMaterial.create({
      data: { organizationId, name: `CeroReentrada ${RUN_ID}`, defaultUnit: "l", defaultReentryHours: 0 },
    });
    expect(ok.defaultReentryHours).toBe(0);
  });

  it("marca de carencia de cosecha: cero días se rechaza; nula y positiva entran", async () => {
    const i = await intervencion();
    await expect(prisma.harvestWithdrawalFlag.create({ data: { harvestEventId, interventionId: i.id, diasQueFaltaban: 0 } }))
      .rejects.toThrow(/harvest_withdrawal_flag_dias_no_negativos/);
    const nula = await prisma.harvestWithdrawalFlag.create({ data: { harvestEventId, interventionId: i.id } });
    expect(nula.diasQueFaltaban).toBeNull();

    const i2 = await intervencion();
    const positiva = await prisma.harvestWithdrawalFlag.create({ data: { harvestEventId, interventionId: i2.id, diasQueFaltaban: 3 } });
    expect(positiva.diasQueFaltaban).toBe(3);
  });
});
