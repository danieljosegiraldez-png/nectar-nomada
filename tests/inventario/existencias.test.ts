/**
 * El saldo derivado — Tarea 3, el corazón del inventario.
 *
 * **«Nunca contado» no es «cero», y ésa es la distinción que justifica todo.**
 * Es ADR-080 copiado entero desde `computeLotBalance`: «nadie ha contado nunca»
 * y «se contó y es cero» son dos afirmaciones distintas sobre la finca.
 * Confundirlas hace que el sistema diga «no queda gallinaza» cuando lo que pasa
 * es que nadie ha mirado el galpón.
 *
 * Y ocurre de verdad: llega el camión y nadie pesa. El agua de la receta de
 * biochar del dueño es literalmente «sin calcular».
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { crearMaterial } from "../../lib/inventario/materiales";
import { recibirLote } from "../../lib/inventario/lotes";
import { existencias, registrarConsumo, registrarConteo, ExistenciasError } from "../../lib/inventario/existencias";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `exi-${Date.now()}`;

let organizationId: string;
let projectId: string;
let gestorId: string;
let materialId: string;

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  const proyecto = await prisma.project.create({
    data: { name: `TEST Existencias (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = proyecto.id;
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Gestor", displayName: `TEST Gestor (${RUN_ID})`, locale: "es" },
  });
  const ua = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  gestorId = ua.id;
  const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "project", scopeRefId: projectId } })) ??
    (await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } }));
  await prisma.assignment.create({ data: { userAccountId: gestorId, roleProfileId: p.id, scopeId: scope.id } });
  const m = await crearMaterial(gestorId, { projectId, organizationId, name: `Gallinaza ${RUN_ID}`, defaultUnit: "quintal" });
  materialId = m.id;
}, 30000);

afterAll(async () => {
  const lotes = await prisma.consumableLot.findMany({ where: { materialId }, select: { id: true } });
  const ids = lotes.map((l) => l.id);
  await prisma.consumableStockEvent.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: ids } }) });
  await prisma.consumableLot.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ organizationId }) });
  const personas = await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } });
  const pid = personas.map((p) => p.id);
  const cuentas = await prisma.userAccount.findMany({ where: { personId: { in: pid } }, select: { id: true } });
  const cid = cuentas.map((c) => c.id);
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cid } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cid } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: pid } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

describe("el saldo se deriva, no se guarda", () => {
  it("28 recibidos menos 3 gastados son 25", async () => {
    const l = await recibirLote(gestorId, { projectId, materialId, batchLabel: `A-${RUN_ID}`, quantity: 28, unit: "quintal" });
    await registrarConsumo(gestorId, { projectId, consumableLotId: l.id, quantity: 3, unit: "quintal" });
    const e = await existencias(gestorId, l.id, { projectId });
    expect(e.quantity.toNumber()).toBe(25);
    expect(e.recorded).toBe(true);
  }, 20000);

  it("un lote recibido SIN pesar dice «nunca contado», NO cero", async () => {
    // ADR-080. Llega el camión y nadie pesa: el lote existe, y cuánto hay es
    // desconocido. Si esto devolviera cero, la pantalla diría «no queda
    // gallinaza» cuando nadie ha mirado el galpón.
    const l = await recibirLote(gestorId, { projectId, materialId, batchLabel: `SP-${RUN_ID}`, unit: "quintal" });
    const e = await existencias(gestorId, l.id, { projectId });
    expect(e.recorded).toBe(false);
  }, 20000);

  it("y un lote gastado ENTERO dice cero CONTADO — el control positivo", async () => {
    // Sin esta mitad, «recorded false» pasaría también en un sistema que nunca
    // lo pone en true: el cero de arriba sería indistinguible de este.
    const l = await recibirLote(gestorId, { projectId, materialId, batchLabel: `CE-${RUN_ID}`, quantity: 5, unit: "quintal" });
    await registrarConsumo(gestorId, { projectId, consumableLotId: l.id, quantity: 5, unit: "quintal" });
    const e = await existencias(gestorId, l.id, { projectId });
    expect(e.recorded).toBe(true);
    expect(e.quantity.toNumber()).toBe(0);
  }, 20000);

  it("pesarlo después lo convierte en contado, sin tocar nada anterior", async () => {
    // El camino normal: llegó sin pesar y al día siguiente se pesa. Es un
    // evento más, no una edición del lote.
    const l = await recibirLote(gestorId, { projectId, materialId, batchLabel: `TA-${RUN_ID}`, unit: "quintal" });
    expect((await existencias(gestorId, l.id, { projectId })).recorded).toBe(false);
    await registrarConteo(gestorId, { projectId, consumableLotId: l.id, quantity: 12, unit: "quintal", reason: "se pesó al día siguiente" });
    const e = await existencias(gestorId, l.id, { projectId });
    expect(e.recorded).toBe(true);
    expect(e.quantity.toNumber()).toBe(12);
  }, 20000);

  it("mezclar unidades se rechaza en vez de sumar sacos con galones", async () => {
    const l = await recibirLote(gestorId, { projectId, materialId, batchLabel: `MU-${RUN_ID}`, quantity: 10, unit: "quintal" });
    await expect(registrarConsumo(gestorId, { projectId, consumableLotId: l.id, quantity: 1, unit: "gal" }))
      .rejects.toThrow(ExistenciasError);
  }, 20000);

  it("el saldo NO sale de ninguna columna: se recalcula de los eventos", async () => {
    // El guardia del diseño, y se comprueba borrando un evento por debajo: si
    // hubiera un saldo guardado en alguna parte, el número no cambiaría.
    const l = await recibirLote(gestorId, { projectId, materialId, batchLabel: `RC-${RUN_ID}`, quantity: 20, unit: "quintal" });
    await registrarConsumo(gestorId, { projectId, consumableLotId: l.id, quantity: 8, unit: "quintal" });
    expect((await existencias(gestorId, l.id, { projectId })).quantity.toNumber()).toBe(12);
    const consumo = await prisma.consumableStockEvent.findFirstOrThrow({
      where: { consumableLotId: l.id, eventType: "consumed" },
    });
    await prisma.consumableStockEvent.delete({ where: { id: consumo.id } });
    expect((await existencias(gestorId, l.id, { projectId })).quantity.toNumber()).toBe(20);
  }, 20000);

  it("leer existencias EXIGE permiso — el agujero que el guardia de acceso cazó", async () => {
    // `existencias` recibía el usuario y no lo usaba: cualquiera podía leer las
    // de cualquier lote. Recibir un principal y no juzgarlo es peor que no
    // recibirlo, porque la firma promete una autorización que no ocurre.
    const l = await recibirLote(gestorId, { projectId, materialId, batchLabel: `PV-${RUN_ID}`, quantity: 4, unit: "quintal" });
    const ajeno = await prisma.userAccount.create({
      data: {
        person: { create: { givenName: "TEST", familyName: "Ajeno", displayName: `TEST Ajeno (${RUN_ID})`, locale: "es" } },
        authProvider: "credentials", status: "active",
      },
    });
    await expect(existencias(ajeno.id, l.id, { projectId })).rejects.toThrow(/forbidden/);
    // Control positivo: el mismo lote, con quien sí tiene ámbito.
    await expect(existencias(gestorId, l.id, { projectId })).resolves.toBeTruthy();
  }, 20000);
});
