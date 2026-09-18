/**
 * La lista del inventario — Tarea 6.
 *
 * Filtra CADA LOTE por el ámbito de quien mira, como la pantalla de equipos
 * filtra cada equipo. Y ordena por lo que hay que atender: lo negativo primero,
 * lo nunca contado después.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { crearMaterial } from "../../lib/inventario/materiales";
import { recibirLote } from "../../lib/inventario/lotes";
import { registrarConsumo } from "../../lib/inventario/existencias";
import { listarInventario } from "../../lib/inventario/lista";
import { moverACustodia } from "../../lib/inventario/custodia";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `lst-${Date.now()}`;

let organizationId: string;
let sitioA: string;
let sitioB: string;
let gestorA: string;   // sólo ve el sitio A
let materialId: string;

async function sitio(nombre: string) {
  const l = await prisma.location.create({
    data: { name: `TEST ${nombre} (${RUN_ID})`, locationType: "site", classification: "internal", organizationId },
  });
  return l.id;
}

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  sitioA = await sitio("Bodega A");
  sitioB = await sitio("Bodega B");
  const ua = await prisma.userAccount.create({
    data: {
      person: { create: { givenName: "TEST", familyName: "GestorA", displayName: `TEST GestorA (${RUN_ID})`, locale: "es" } },
      authProvider: "credentials", status: "active",
    },
  });
  gestorA = ua.id;
  const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitioA } });
  await prisma.assignment.create({ data: { userAccountId: gestorA, roleProfileId: p.id, scopeId: scope.id } });
  const m = await crearMaterial(gestorA, { locationId: sitioA, organizationId, name: `Gallinaza ${RUN_ID}`, defaultUnit: "quintal" });
  materialId = m.id;
}, 30000);

afterAll(async () => {
  const lotes = await prisma.consumableLot.findMany({ where: { materialId }, select: { id: true } });
  const ids = lotes.map((l) => l.id);
  await prisma.consumableStockEvent.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: ids } }) });
  await prisma.consumableCustody.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: ids } }) });
  await prisma.consumableLot.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ organizationId }) });
  const personas = await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } });
  const pid = personas.map((p) => p.id);
  const cuentas = await prisma.userAccount.findMany({ where: { personId: { in: pid } }, select: { id: true } });
  const cid = cuentas.map((c) => c.id);
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cid } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [sitioA, sitioB] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cid } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: pid } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [sitioA, sitioB] } }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

describe("la lista del inventario", () => {
  it("quien atiende la bodega A ve su lote y NO el de la bodega B", async () => {
    // El filtro por elemento. Sin él, cualquiera con un permiso en algún sitio
    // vería el inventario de todas las fincas.
    await recibirLote(gestorA, { locationId: sitioA, materialId, batchLabel: `EN-A-${RUN_ID}`, quantity: 5, unit: "quintal" });
    await prisma.consumableLot.create({
      data: { materialId, batchLabel: `EN-B-${RUN_ID}`, receivedAt: new Date(), locationId: sitioB },
    });
    const lista = await listarInventario(gestorA);
    const etiquetas = lista.flatMap((m) => m.lotes.map((l) => l.batchLabel));
    expect(etiquetas).toContain(`EN-A-${RUN_ID}`);        // control: ve lo suyo
    expect(etiquetas).not.toContain(`EN-B-${RUN_ID}`);
  }, 20000);

  it("un lote SIN ubicación no lo ve quien sólo atiende un sitio", async () => {
    // Lo desconocido se cierra: sin ancla cae a plataforma.
    await prisma.consumableLot.create({
      data: { materialId, batchLabel: `SIN-UBIC-${RUN_ID}`, receivedAt: new Date() },
    });
    const etiquetas = (await listarInventario(gestorA)).flatMap((m) => m.lotes.map((l) => l.batchLabel));
    expect(etiquetas).not.toContain(`SIN-UBIC-${RUN_ID}`);
  }, 20000);

  it("lo NEGATIVO sale primero, y lo NUNCA CONTADO después", async () => {
    // Ordenado por lo que hay que atender, no por fecha: una lista larga
    // ordenada por fecha esconde el descuadre en la página tres.
    await recibirLote(gestorA, { locationId: sitioA, materialId, batchLabel: `OK-${RUN_ID}`, quantity: 9, unit: "quintal" });
    await recibirLote(gestorA, { locationId: sitioA, materialId, batchLabel: `NC-${RUN_ID}`, unit: "quintal" });
    const neg = await recibirLote(gestorA, { locationId: sitioA, materialId, batchLabel: `NEG-${RUN_ID}`, quantity: 1, unit: "quintal" });
    await registrarConsumo(gestorA, { locationId: sitioA, consumableLotId: neg.id, quantity: 4, unit: "quintal" });

    const lotes = (await listarInventario(gestorA)).flatMap((m) => m.lotes).filter((l) => l.batchLabel.endsWith(RUN_ID));
    const orden = lotes.map((l) => l.batchLabel);
    expect(orden.indexOf(`NEG-${RUN_ID}`)).toBeLessThan(orden.indexOf(`NC-${RUN_ID}`));
    expect(orden.indexOf(`NC-${RUN_ID}`)).toBeLessThan(orden.indexOf(`OK-${RUN_ID}`));

    const nc = lotes.find((l) => l.batchLabel === `NC-${RUN_ID}`)!;
    expect(nc.recorded).toBe(false);
    const n = lotes.find((l) => l.batchLabel === `NEG-${RUN_ID}`)!;
    expect(n.requiereReconciliacion).toBe(true);
    expect(n.quantity).toBe(-3);
  }, 20000);

  it("cada lote trae su vencimiento y su custodia vigente — y sin fecha dice SIN_FECHA, no vigente", async () => {
    const venc = await recibirLote(gestorA, { locationId: sitioA, materialId, batchLabel: `VEN-${RUN_ID}`, quantity: 1, unit: "quintal", expiresAt: new Date("2020-01-01T00:00:00Z") });
    await recibirLote(gestorA, { locationId: sitioA, materialId, batchLabel: `SF-${RUN_ID}`, quantity: 1, unit: "quintal" });
    const persona = await prisma.person.findFirstOrThrow({ where: { displayName: { contains: RUN_ID } } });
    await moverACustodia(gestorA, { consumableLotId: venc.id, locationId: sitioA, responsiblePersonId: persona.id, desde: new Date() });

    const lotes = (await listarInventario(gestorA)).flatMap((m) => m.lotes);
    const v = lotes.find((l) => l.batchLabel === `VEN-${RUN_ID}`)!;
    expect(v.vencimiento.estado).toBe("VENCIDO");
    expect(v.custodia).toEqual({ sitio: `TEST Bodega A (${RUN_ID})`, responsable: persona.displayName });
    const sf = lotes.find((l) => l.batchLabel === `SF-${RUN_ID}`)!;
    expect(sf.vencimiento).toEqual({ estado: "SIN_FECHA" });
    expect(sf.custodia).toBeNull();
  }, 20000);
});
