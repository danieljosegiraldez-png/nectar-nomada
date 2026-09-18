/**
 * El aviso del botiquín — botiquín, Tarea 8.
 *
 * Daniel, 2026-09-17: el aviso de vencido o por vencer va «al usuario en el mismo
 * dashboard de un encargado de apiario y/o apicultor vinculado». Decisión del spec:
 * lo ve quien tiene `lot:manage` sobre donde está el frasco —su custodia VIGENTE,
 * y si no tiene, donde se recibió—.
 *
 * Spec: docs/superpowers/specs/2026-09-17-faena-de-colmena-y-botiquin-design.md §B.4
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { crearMaterial } from "../../lib/inventario/materiales";
import { recibirLote } from "../../lib/inventario/lotes";
import { registrarConsumo } from "../../lib/inventario/existencias";
import { moverACustodia } from "../../lib/inventario/custodia";
import { avisosDeBotiquin } from "../../lib/inventario/avisos";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `avi-${Date.now()}`;
const hoy = "2026-09-17";
const VENCIDO = new Date("2026-09-01T00:00:00Z");
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);

let organizationId: string;
let bodega: string;
let apiario: string;
let otroSitio: string;
let gestorBodega: string;
let gestorApiario: string;
let gestorSoloBodega: string;
let gestorDeOtroSitio: string;
let apivarId: string;
let calId: string;

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  const mk = async (n: string) =>
    (await prisma.location.create({ data: { name: `TEST ${n} (${RUN_ID})`, locationType: "site", classification: "internal", organizationId } })).id;
  bodega = await mk("Bodega");
  apiario = await mk("Apiario");
  otroSitio = await mk("Otro");
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
  const cuenta = async (n: string, sitios: string[]) => {
    const ua = await prisma.userAccount.create({
      data: {
        person: { create: { givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN_ID})`, locale: "es" } },
        authProvider: "credentials", status: "active",
      },
    });
    for (const sitio of sitios) {
      const scope =
        (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: sitio } })) ??
        (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitio } }));
      await prisma.assignment.create({ data: { userAccountId: ua.id, roleProfileId: perfil.id, scopeId: scope.id } });
    }
    return ua.id;
  };
  gestorBodega = await cuenta("GestorBodega", [bodega, apiario]);
  gestorApiario = await cuenta("GestorApiario", [apiario]);
  gestorSoloBodega = await cuenta("GestorSoloBodega", [bodega]);
  gestorDeOtroSitio = await cuenta("GestorOtro", [otroSitio]);
  apivarId = (await crearMaterial(gestorBodega, {
    locationId: bodega, organizationId, name: `Apivar ${RUN_ID}`, defaultUnit: "tira",
    isVeterinaryMedicine: true, avisarDiasAntes: 30,
  })).id;
  calId = (await crearMaterial(gestorBodega, { locationId: bodega, organizationId, name: `Cal ${RUN_ID}`, defaultUnit: "saco" })).id;
  await recibirLote(gestorBodega, { locationId: bodega, materialId: apivarId, batchLabel: `VENC-${RUN_ID}`, quantity: 1, unit: "tira", expiresAt: VENCIDO });
}, 30000);

afterAll(async () => {
  const lotes = (await prisma.consumableLot.findMany({ where: { materialId: { in: [apivarId, calId] } }, select: { id: true } })).map((l) => l.id);
  const personas = (await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } })).map((p) => p.id);
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.consumableCustody.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: lotes } }) });
  await prisma.consumableStockEvent.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: lotes } }) });
  await prisma.consumableLot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ organizationId }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [bodega, apiario, otroSitio] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [bodega, apiario, otroSitio] } }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

const etiquetas = async (quien: string) => (await avisosDeBotiquin(quien, { hoy })).map((a) => a.batchLabel);

describe("el aviso del botiquín", () => {
  it("quien gestiona la bodega ve el frasco vencido que queda, con cuántos días lleva", async () => {
    const aviso = (await avisosDeBotiquin(gestorBodega, { hoy })).find((a) => a.batchLabel === `VENC-${RUN_ID}`);
    expect(aviso).toMatchObject({ estado: "VENCIDO", dias: 16, producto: `Apivar ${RUN_ID}` });
  }, 20000);

  it("quien atiende OTRO sitio no lo ve", async () => {
    // El control negativo del anterior: sin él, «lo ve» pasaría también si la
    // función devolviera todos los avisos a todo el mundo.
    expect(await etiquetas(gestorDeOtroSitio)).not.toContain(`VENC-${RUN_ID}`);
  }, 20000);

  it("un frasco vencido y GASTADO no avisa — no hay nada que hacer con él", async () => {
    const l = await recibirLote(gestorBodega, { locationId: bodega, materialId: apivarId, batchLabel: `GAST-${RUN_ID}`, quantity: 2, unit: "tira", expiresAt: VENCIDO });
    await registrarConsumo(gestorBodega, { locationId: bodega, consumableLotId: l.id, quantity: 2, unit: "tira" });
    expect(await etiquetas(gestorBodega)).not.toContain(`GAST-${RUN_ID}`);
  }, 20000);

  it("un frasco vencido NUNCA CONTADO sí avisa — puede quedar", async () => {
    // Nunca contado no es cero: si nadie lo ha pesado, puede estar ahí.
    await recibirLote(gestorBodega, { locationId: bodega, materialId: apivarId, batchLabel: `NC-${RUN_ID}`, unit: "tira", expiresAt: VENCIDO });
    expect(await etiquetas(gestorBodega)).toContain(`NC-${RUN_ID}`);
  }, 20000);

  it("el aviso sigue al frasco: se mide en su custodia VIGENTE, no donde se recibió", async () => {
    // Recibido en la bodega y llevado al apiario: ahora le toca a quien atiende
    // el apiario, no a quien atiende la bodega.
    const l = await recibirLote(gestorBodega, { locationId: bodega, materialId: apivarId, batchLabel: `MOV-${RUN_ID}`, quantity: 1, unit: "tira", expiresAt: VENCIDO });
    await moverACustodia(gestorBodega, { consumableLotId: l.id, locationId: apiario, desde: hace(1) });
    expect(await etiquetas(gestorApiario)).toContain(`MOV-${RUN_ID}`);
    expect(await etiquetas(gestorSoloBodega)).not.toContain(`MOV-${RUN_ID}`);
  }, 20000);

  it("un producto que NO es medicamento no avisa aunque tenga fecha", async () => {
    // El aviso es del botiquín. Un saco de cal con fecha no debe llenar el
    // tablero de avisos que nadie pidió.
    await recibirLote(gestorBodega, { locationId: bodega, materialId: calId, batchLabel: `CAL-${RUN_ID}`, quantity: 1, unit: "saco", expiresAt: VENCIDO });
    expect(await etiquetas(gestorBodega)).not.toContain(`CAL-${RUN_ID}`);
  }, 20000);

  it("por vencer dentro del aviso del producto avisa con los días que faltan; fuera de él, no", async () => {
    await recibirLote(gestorBodega, { locationId: bodega, materialId: apivarId, batchLabel: `PRONTO-${RUN_ID}`, quantity: 1, unit: "tira", expiresAt: new Date("2026-10-07T00:00:00Z") });
    await recibirLote(gestorBodega, { locationId: bodega, materialId: apivarId, batchLabel: `LEJOS-${RUN_ID}`, quantity: 1, unit: "tira", expiresAt: new Date("2027-03-01T00:00:00Z") });
    const avisos = await avisosDeBotiquin(gestorBodega, { hoy });
    expect(avisos.find((a) => a.batchLabel === `PRONTO-${RUN_ID}`)).toMatchObject({ estado: "POR_VENCER", dias: 20 });
    expect(avisos.map((a) => a.batchLabel)).not.toContain(`LEJOS-${RUN_ID}`);
  }, 20000);
});
