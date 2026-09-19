/**
 * Las reglas de la entrega de cosecha que viven EN LA BASE, no sólo en el servicio.
 *
 * Spec: docs/superpowers/specs/2026-09-18-jornada-y-entrega-de-cosecha-design.md §3.3.
 * Plan: docs/superpowers/plans/2026-09-18-jornada-y-entrega-de-cosecha.md, Tarea 1.
 *
 * Cada rechazo lleva su control positivo: si la fila válida tampoco entrara, «se rechaza» no
 * probaría nada. Grupo `base-sembrada`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `ent-esq-${Date.now()}`;
let organizationId: string;
let siteId: string;
let plotId: string;
let blockId: string;
let personId: string;
let jornadaId: string;
const entregas: string[] = [];

beforeAll(async () => {
  organizationId = (
    await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Finca (${RUN})`, status: "approved", classification: "internal" } })
  ).id;
  siteId = (await prisma.location.create({ data: { name: `TEST Sitio (${RUN})`, locationType: "site", organizationId, classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { name: `TEST Parcela (${RUN})`, locationType: "plot", parentLocationId: siteId, classification: "internal" } })).id;
  blockId = (await prisma.plotBlock.create({ data: { locationId: plotId, name: `TEST Bloque (${RUN})` } })).id;
  personId = randomUUID();
  await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: "Recolector", displayName: `TEST Recolector (${RUN})` } });
  jornadaId = (await prisma.jornadaDeCosecha.create({ data: { fincaSiteId: siteId, fecha: new Date() } })).id;
}, 30000);

afterAll(async () => {
  await prisma.entregaDeCosecha.deleteMany({ where: assertDefinedWhere({ jornadaId }) });
  await prisma.jornadaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: jornadaId }) });
  await prisma.plotBlock.deleteMany({ where: assertDefinedWhere({ id: blockId }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: siteId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
}, 30000);

function entrega(extra: Record<string, unknown>) {
  return prisma.entregaDeCosecha.create({
    data: { jornadaId, recolectorId: personId, pesoFincaKg: 1.5, enviadaAt: new Date(), anotadaPor: personId, ...extra },
  });
}

describe("la entrega de cosecha, en la base", () => {
  it("exactamente un origen: dos se rechazan, ninguno también; uno entra", async () => {
    await expect(entrega({ locationId: plotId, plotBlockId: blockId })).rejects.toThrow(/entrega_de_cosecha_un_origen/);
    await expect(entrega({})).rejects.toThrow(/entrega_de_cosecha_un_origen/);
    const buena = await entrega({ plotBlockId: blockId });
    entregas.push(buena.id);
    expect(buena.plotBlockId).toBe(blockId);
  }, 20000);

  it("el peso de finca tiene que ser mayor que cero", async () => {
    await expect(entrega({ locationId: plotId, pesoFincaKg: 0 })).rejects.toThrow(/entrega_de_cosecha_peso_positivo/);
    const buena = await entrega({ locationId: plotId, pesoFincaKg: 0.001 });
    entregas.push(buena.id);
    expect(Number(buena.pesoFincaKg)).toBe(0.001);
  }, 20000);

  it("anulada exige fecha y motivo; enviada no lleva ninguno", async () => {
    await expect(entrega({ locationId: plotId, estado: "anulada" })).rejects.toThrow(/entrega_de_cosecha_anulacion_completa/);
    await expect(entrega({ locationId: plotId, estado: "anulada", anuladaAt: new Date(), motivoAnulacion: "   " })).rejects.toThrow(
      /entrega_de_cosecha_anulacion_completa/,
    );
    await expect(entrega({ locationId: plotId, motivoAnulacion: "suelto" })).rejects.toThrow(/entrega_de_cosecha_anulacion_completa/);
    const buena = await entrega({ locationId: plotId, estado: "anulada", anuladaAt: new Date(), motivoAnulacion: "pesada dos veces" });
    entregas.push(buena.id);
    expect(buena.estado).toBe("anulada");
  }, 20000);

  it("una jornada cerrada lleva cuándo se cerró, y una abierta no", async () => {
    await expect(prisma.jornadaDeCosecha.create({ data: { fincaSiteId: siteId, fecha: new Date(), estado: "cerrada" } })).rejects.toThrow(
      /jornada_de_cosecha_cierre_completo/,
    );
    const cerrada = await prisma.jornadaDeCosecha.create({ data: { fincaSiteId: siteId, fecha: new Date(), estado: "cerrada", cerradaAt: new Date() } });
    await prisma.jornadaDeCosecha.delete({ where: { id: cerrada.id } });
    expect(cerrada.estado).toBe("cerrada");
  }, 20000);
});
