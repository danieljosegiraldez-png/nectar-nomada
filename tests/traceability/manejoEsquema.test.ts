import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `mesq-${Date.now()}`;
let organizationId: string;
let parcelaId: string;
let materialId: string;

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
}, 30000);

afterAll(async () => {
  const ints = await prisma.plotIntervention.findMany({ where: { locationId: parcelaId }, select: { id: true } });
  const ids = ints.map((i) => i.id);
  await prisma.plotInterventionLine.deleteMany({ where: assertDefinedWhere({ interventionId: { in: ids } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ correctsId: { in: ids } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
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

  it("marca de vencimiento sin frasco se rechaza", async () => {
    const i = await intervencion();
    await expect(prisma.plotInterventionLine.create({ data: { interventionId: i.id, materialId, lotExpiredAtApplication: true } }))
      .rejects.toThrow(/marca_de_vencimiento_exige_frasco/);
  });

  it("`otro` sin nota se rechaza; con nota entra", async () => {
    await expect(intervencion({ target: "otro" })).rejects.toThrow(/plot_intervention_otro_con_nota/);
    const ok = await intervencion({ target: "otro", targetNote: "hormiga arriera" });
    expect(ok.targetNote).toBe("hormiga arriera");
  });

  it("corrección sin motivo se rechaza; con motivo entra", async () => {
    const original = await intervencion();
    await expect(intervencion({ correctsId: original.id, correctionReason: "  " }))
      .rejects.toThrow(/plot_intervention_correccion_con_motivo/);
    const ok = await intervencion({ correctsId: original.id, correctionReason: "la hora era otra" });
    expect(ok.correctsId).toBe(original.id);
  });

  it("reentrada por defecto negativa en el producto se rechaza", async () => {
    await expect(prisma.consumableMaterial.create({
      data: { organizationId, name: `Neg ${RUN_ID}`, defaultUnit: "l", defaultReentryHours: -1 },
    })).rejects.toThrow(/consumable_material_reentrada_no_negativa/);
  });
});
