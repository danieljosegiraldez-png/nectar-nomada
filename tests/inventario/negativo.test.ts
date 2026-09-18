/**
 * Lo negativo avisa, se cuadra, y NUNCA bloquea — Tarea 4 del plan.
 *
 * **Gastar más de lo que el sistema cree que hay es legítimo**: el sistema no
 * sabe lo que hay, sabe lo que le contaron. Bloquearlo obligaría al operario a
 * mentir en la cantidad para poder seguir trabajando, y entonces el sistema
 * sabría MENOS que antes. Es la misma doctrina que la venta temprana: avisa, no
 * bloquea.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { crearMaterial } from "../../lib/inventario/materiales";
import { recibirLote } from "../../lib/inventario/lotes";
import { existencias, registrarConsumo, reconciliar, ExistenciasError } from "../../lib/inventario/existencias";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `neg-${Date.now()}`;

let organizationId: string;
let projectId: string;
let gestorId: string;
let materialId: string;

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  const proyecto = await prisma.project.create({
    data: { name: `TEST Negativo (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = proyecto.id;
  const ua = await prisma.userAccount.create({
    data: {
      person: { create: { givenName: "TEST", familyName: "Gestor", displayName: `TEST Gestor (${RUN_ID})`, locale: "es" } },
      authProvider: "credentials", status: "active",
    },
  });
  gestorId = ua.id;
  const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "project", scopeRefId: projectId } })) ??
    (await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } }));
  await prisma.assignment.create({ data: { userAccountId: gestorId, roleProfileId: p.id, scopeId: scope.id } });
  const m = await crearMaterial(gestorId, { projectId, organizationId, name: `Melaza ${RUN_ID}`, defaultUnit: "gal" });
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

async function loteDe(gal: number, sufijo: string) {
  return recibirLote(gestorId, { projectId, materialId, batchLabel: `${sufijo}-${RUN_ID}`, quantity: gal, unit: "gal" });
}

describe("lo negativo avisa, no bloquea", () => {
  it("gastar más de lo que hay SE REGISTRA", async () => {
    // Si esto cayera, el operario tendría que mentir en la cantidad para poder
    // seguir, y el sistema sabría menos que antes de tener inventario.
    const l = await loteDe(5, "pasa");
    const c = await registrarConsumo(gestorId, { projectId, consumableLotId: l.id, quantity: 8, unit: "gal" });
    expect(c.id).toBeTruthy();
  }, 20000);

  it("y el saldo queda NEGATIVO y marcado, que es la pregunta", async () => {
    // Sin esta mitad, «se puede gastar de más» pasaría también en un sistema
    // que no lleva la cuenta: el fallo contrario e igual de malo.
    const l = await loteDe(5, "marca");
    await registrarConsumo(gestorId, { projectId, consumableLotId: l.id, quantity: 8, unit: "gal" });
    const e = await existencias(gestorId, l.id, { projectId });
    expect(e.quantity.toNumber()).toBe(-3);
    expect(e.requiereReconciliacion).toBe(true);
  }, 20000);

  it("cuadrarlo es OTRO evento con su razón, no una edición", async () => {
    const l = await loteDe(5, "cuadra");
    await registrarConsumo(gestorId, { projectId, consumableLotId: l.id, quantity: 8, unit: "gal" });
    await reconciliar(gestorId, {
      projectId, consumableLotId: l.id, quantity: 3, unit: "gal",
      reason: "apareció un bidón sin registrar en la bodega",
    });
    const e = await existencias(gestorId, l.id, { projectId });
    expect(e.quantity.toNumber()).toBe(0);
    expect(e.requiereReconciliacion).toBe(false);
    // Y el negativo SIGUE en la historia: nada se borró ni se editó.
    expect(await prisma.consumableStockEvent.count({ where: { consumableLotId: l.id } })).toBe(3);
  }, 20000);

  it("una reconciliación SIN razón se rechaza", async () => {
    const l = await loteDe(5, "sinrazon");
    await expect(reconciliar(gestorId, { projectId, consumableLotId: l.id, quantity: 1, unit: "gal", reason: "  " }))
      .rejects.toThrow(ExistenciasError);
  }, 20000);

  it("y la BASE la rechaza aunque alguien rodee el servicio", async () => {
    // El CHECK, no la interfaz. Un guion que escriba directo en la tabla se
    // topa con la misma regla: una afirmación sobre lo que pasó sin razón no se
    // puede auditar.
    const l = await loteDe(5, "check");
    await expect(
      prisma.consumableStockEvent.create({
        data: {
          consumableLotId: l.id, eventType: "adjustment_increase",
          quantity: 1, unit: "gal", occurredAt: new Date(),
          provenanceClass: "direct_observation",
        },
      }),
    ).rejects.toThrow();
  }, 20000);

  it("un ajuste a la BAJA también cuadra, y también exige razón", async () => {
    // El otro sentido: sobraba en el papel y no en la bodega.
    const l = await loteDe(10, "baja");
    await reconciliar(gestorId, {
      projectId, consumableLotId: l.id, quantity: 4, unit: "gal",
      reason: "se derramó y nadie lo anotó", direccion: "baja",
    });
    const e = await existencias(gestorId, l.id, { projectId });
    expect(e.quantity.toNumber()).toBe(6);
  }, 20000);
});
