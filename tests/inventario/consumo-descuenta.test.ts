/**
 * El consumo que ya se registra hoy pasa a descontar — Tarea 5 del plan.
 *
 * **`MaterialConsumptionEntry` existe desde antes y anota lo que se gastó en
 * TEXTO LIBRE.** Engancharlo al lote es lo que convierte cuatro tareas de
 * inventario en algo que sirve: hasta ahora se podía saber cuánto entró y
 * cuánto se declaró aparte, pero el consumo real de campo no tocaba las
 * existencias.
 *
 * **El enlace es OPCIONAL para siempre**, y esa es la mitad importante: las
 * filas de hoy tienen texto libre y no se pueden reasignar sin adivinar, y
 * obligar a elegir lote convertiría una anotación de diez segundos en un
 * trámite que no se hace.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { crearMaterial } from "../../lib/inventario/materiales";
import { recibirLote } from "../../lib/inventario/lotes";
import { existencias } from "../../lib/inventario/existencias";
import { recordMaterialConsumptionEntry } from "../../lib/traceability/operations";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `cd-${Date.now()}`;

let organizationId: string;
let projectId: string;
let locationId: string;
let gestorId: string;
let materialId: string;

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  const proyecto = await prisma.project.create({
    data: { name: `TEST Consumo (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = proyecto.id;
  const loc = await prisma.location.create({
    data: { name: `TEST Bodega (${RUN_ID})`, locationType: "site", classification: "internal", organizationId },
  });
  locationId = loc.id;
  const ua = await prisma.userAccount.create({
    data: {
      person: { create: { givenName: "TEST", familyName: "Gestor", displayName: `TEST Gestor (${RUN_ID})`, locale: "es" } },
      authProvider: "credentials", status: "active",
    },
  });
  gestorId = ua.id;
  const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
  // Ámbito en la UBICACIÓN: el consumo se autoriza por dónde ocurrió.
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } })) ??
    (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  await prisma.assignment.create({ data: { userAccountId: gestorId, roleProfileId: p.id, scopeId: scope.id } });
  const m = await crearMaterial(gestorId, { locationId, organizationId, name: `Aserrín ${RUN_ID}`, defaultUnit: "saco" });
  materialId = m.id;
}, 30000);

afterAll(async () => {
  const lotes = await prisma.consumableLot.findMany({ where: { materialId }, select: { id: true } });
  const ids = lotes.map((l) => l.id);
  await prisma.materialConsumptionEntry.deleteMany({ where: assertDefinedWhere({ locationId }) });
  await prisma.consumableStockEvent.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: ids } }) });
  await prisma.consumableLot.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ organizationId }) });
  const personas = await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } });
  const pid = personas.map((p) => p.id);
  const cuentas = await prisma.userAccount.findMany({ where: { personId: { in: pid } }, select: { id: true } });
  const cid = cuentas.map((c) => c.id);
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cid } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: locationId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cid } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: pid } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

const base = {
  materialName: "Aserrín",
  provenanceClass: "direct_observation" as const,
};

describe("el consumo de campo descuenta del lote", () => {
  it("consumir CON lote baja las existencias", async () => {
    const l = await recibirLote(gestorId, { locationId, materialId, batchLabel: `A-${RUN_ID}`, quantity: 10, unit: "saco" });
    await recordMaterialConsumptionEntry(gestorId, {
      ...base,
      parent: { kind: "location", locationId },
      batchLabel: `A-${RUN_ID}`,
      consumableLotId: l.id,
      quantity: 2,
      unit: "saco",
    });
    expect((await existencias(gestorId, l.id, { locationId })).quantity.toNumber()).toBe(8);
  }, 20000);

  it("consumir SIN lote sigue siendo válido y NO mueve existencias", async () => {
    // El guardia de que esto no rompe lo que ya se hacía. Las filas de hoy
    // llevan texto libre y no se pueden reasignar sin adivinar; obligar a
    // elegir lote convertiría una anotación de diez segundos en un trámite.
    const l = await recibirLote(gestorId, { locationId, materialId, batchLabel: `B-${RUN_ID}`, quantity: 7, unit: "saco" });
    const e = await recordMaterialConsumptionEntry(gestorId, {
      ...base,
      parent: { kind: "location", locationId },
      batchLabel: "sin lote",
      quantity: 3,
      unit: "saco",
    });
    expect(e.id).toBeTruthy();
    expect(e.consumableLotId).toBeNull();
    expect((await existencias(gestorId, l.id, { locationId })).quantity.toNumber()).toBe(7);
  }, 20000);

  it("si el descuento falla, el consumo NO se guarda", async () => {
    // Atomicidad. Un consumo guardado sin su descuento sería material gastado
    // que el inventario nunca vio, y el saldo mentiría desde ese momento.
    const l = await recibirLote(gestorId, { locationId, materialId, batchLabel: `C-${RUN_ID}`, quantity: 5, unit: "saco" });
    const antes = await prisma.materialConsumptionEntry.count({ where: { locationId } });
    await expect(
      recordMaterialConsumptionEntry(gestorId, {
        ...base,
        parent: { kind: "location", locationId },
        batchLabel: `C-${RUN_ID}`,
        consumableLotId: l.id,
        quantity: 1,
        unit: "galón",   // el lote va en sacos
      }),
    ).rejects.toThrow(/unidad/i);
    expect(await prisma.materialConsumptionEntry.count({ where: { locationId } })).toBe(antes);
    expect((await existencias(gestorId, l.id, { locationId })).quantity.toNumber()).toBe(5);
  }, 20000);

  it("un consumo con lote pero SIN cantidad no descuenta, y se registra igual", async () => {
    // «Se usó aserrín de este saco» sin pesar es un dato: dice de qué lote
    // salió aunque no cuánto. Inventar un descuento aquí sería peor que no
    // descontar nada.
    const l = await recibirLote(gestorId, { locationId, materialId, batchLabel: `D-${RUN_ID}`, quantity: 4, unit: "saco" });
    const e = await recordMaterialConsumptionEntry(gestorId, {
      ...base,
      parent: { kind: "location", locationId },
      batchLabel: `D-${RUN_ID}`,
      consumableLotId: l.id,
    });
    expect(e.consumableLotId).toBe(l.id);
    expect((await existencias(gestorId, l.id, { locationId })).quantity.toNumber()).toBe(4);
  }, 20000);
});
