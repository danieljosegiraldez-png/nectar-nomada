/**
 * PR B del manejo fitosanitario, Tarea 1 — el esquema.
 *
 * Dos cambios, los dos con su CHECK/FK en la base, no en TypeScript:
 * - `PlotInterventionArea` ahora admite un bloque además de una planta —
 *   exactamente uno de los dos (`plot_intervention_area_planta_o_bloque`).
 * - `TrapRule.suggestedMaterialId` es un producto opcional: el texto
 *   `suggestedAction` sigue siendo la nota obligatoria.
 *
 * Base real, en el grupo `base-sembrada` (ver scripts/pruebas-por-compuerta.txt).
 * Andamiaje como `tests/traceability/manejoEsquema.test.ts`: RUN_ID,
 * organización de prueba, limpieza completa en `afterAll` con
 * `assertDefinedWhere`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `mprb-${Date.now()}`;
let organizationId: string;
let parcelaId: string;
let specimenId: string;
let bloqueAId: string;
let bloqueBId: string;
let materialId: string;
let farmLocationConProductoId: string;
let farmLocationSinProductoId: string;

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  const p = await prisma.location.create({
    data: { name: `TEST Parcela (${RUN_ID})`, locationType: "plot", classification: "internal", organizationId },
  });
  parcelaId = p.id;

  const specimen = await prisma.specimen.create({
    data: { locationId: parcelaId, specimenType: "plant", commonName: `Cafeto ${RUN_ID}`, provenanceClass: "original_record" },
  });
  specimenId = specimen.id;

  const bloqueA = await prisma.plotBlock.create({ data: { locationId: parcelaId, name: `Bloque A ${RUN_ID}` } });
  bloqueAId = bloqueA.id;
  const bloqueB = await prisma.plotBlock.create({ data: { locationId: parcelaId, name: `Bloque B ${RUN_ID}` } });
  bloqueBId = bloqueB.id;

  const material = await prisma.consumableMaterial.create({
    data: { organizationId, name: `Prod ${RUN_ID}`, defaultUnit: "l", isPlantProtection: true },
  });
  materialId = material.id;

  const farmA = await prisma.location.create({
    data: { name: `TEST Finca A (${RUN_ID})`, locationType: "site", classification: "internal", organizationId },
  });
  farmLocationConProductoId = farmA.id;
  const farmB = await prisma.location.create({
    data: { name: `TEST Finca B (${RUN_ID})`, locationType: "site", classification: "internal", organizationId },
  });
  farmLocationSinProductoId = farmB.id;
}, 30000);

afterAll(async () => {
  const ints = await prisma.plotIntervention.findMany({ where: { locationId: parcelaId }, select: { id: true } });
  const ids = ints.map((i) => i.id);
  await prisma.plotInterventionArea.deleteMany({ where: assertDefinedWhere({ interventionId: { in: ids } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.trapRule.deleteMany({
    where: assertDefinedWhere({ farmLocationId: { in: [farmLocationConProductoId, farmLocationSinProductoId] } }),
  });
  await prisma.plotBlock.deleteMany({ where: assertDefinedWhere({ locationId: parcelaId }) });
  await prisma.specimen.deleteMany({ where: assertDefinedWhere({ id: specimenId }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ organizationId }) });
  await prisma.location.deleteMany({
    where: assertDefinedWhere({ id: { in: [parcelaId, farmLocationConProductoId, farmLocationSinProductoId] } }),
  });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

const intervencion = (over: Record<string, unknown> = {}) =>
  prisma.plotIntervention.create({
    data: {
      locationId: parcelaId, kind: "aplicacion", target: "broca",
      occurredAt: new Date("2026-09-01T15:00:00Z"), provenanceClass: "original_record", ...over,
    },
  });

describe("el área es una planta o un bloque, nunca los dos ni ninguno", () => {
  it("planta y bloque a la vez se rechaza; sólo planta entra", async () => {
    const i = await intervencion();
    await expect(
      prisma.plotInterventionArea.create({ data: { interventionId: i.id, specimenId, plotBlockId: bloqueAId } }),
    ).rejects.toThrow(/plot_intervention_area_planta_o_bloque/);

    const ok = await prisma.plotInterventionArea.create({ data: { interventionId: i.id, specimenId } });
    expect(ok.specimenId).toBe(specimenId);
    expect(ok.plotBlockId).toBeNull();
  });

  it("ni planta ni bloque se rechaza; sólo bloque entra", async () => {
    const i = await intervencion();
    await expect(prisma.plotInterventionArea.create({ data: { interventionId: i.id } })).rejects.toThrow(
      /plot_intervention_area_planta_o_bloque/,
    );

    const ok = await prisma.plotInterventionArea.create({ data: { interventionId: i.id, plotBlockId: bloqueAId } });
    expect(ok.plotBlockId).toBe(bloqueAId);
    expect(ok.specimenId).toBeNull();
  });

  it("el mismo bloque dos veces en la misma intervención se rechaza; dos bloques distintos entran", async () => {
    const i = await intervencion();
    await prisma.plotInterventionArea.create({ data: { interventionId: i.id, plotBlockId: bloqueAId } });
    await expect(
      prisma.plotInterventionArea.create({ data: { interventionId: i.id, plotBlockId: bloqueAId } }),
    ).rejects.toMatchObject({ code: "P2002" });

    const otro = await prisma.plotInterventionArea.create({ data: { interventionId: i.id, plotBlockId: bloqueBId } });
    expect(otro.plotBlockId).toBe(bloqueBId);
  });
});

describe("la regla de trampa sugiere un producto, opcional", () => {
  it("sin producto entra y queda nulo", async () => {
    const regla = await prisma.trapRule.create({
      data: {
        farmLocationId: farmLocationSinProductoId, triggerLevel: "algunos", normalDays: 15, alertDays: 7,
        suggestedAction: "aplicar repelente Bralic",
      },
    });
    expect(regla.suggestedMaterialId).toBeNull();
  });

  it("con producto entra y lo relee", async () => {
    const regla = await prisma.trapRule.create({
      data: {
        farmLocationId: farmLocationConProductoId, triggerLevel: "algunos", normalDays: 15, alertDays: 7,
        suggestedAction: "aplicar repelente Bralic", suggestedMaterialId: materialId,
      },
    });
    const releida = await prisma.trapRule.findUniqueOrThrow({ where: { id: regla.id } });
    expect(releida.suggestedMaterialId).toBe(materialId);
  });
});
