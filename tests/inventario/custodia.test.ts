/**
 * La custodia de un frasco: dónde está y quién responde — botiquín, Tarea 5.
 *
 * **Dos preguntas distintas, y las dos son de Daniel:** «¿dónde está el
 * Apivar?» y «¿quién lo tiene?». El equipo y el medicamento pueden estar bajo
 * distinto custodio o lugar. Por eso la custodia lleva UBICACIÓN y PERSONA, con
 * intervalo — la figura de `StorageAssignment`, que está atada al lote de café.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { crearMaterial } from "../../lib/inventario/materiales";
import { recibirLote } from "../../lib/inventario/lotes";
import { moverACustodia, custodiaVigente, CustodiaError } from "../../lib/inventario/custodia";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `cus-${Date.now()}`;
const hace = (d: number) => new Date(Date.now() - d * 86_400_000);

let organizationId: string;
let finca: string;
let bodega: string;
let apiario: string;
let otraFinca: string;
let gestorId: string;
let materialId: string;
let bob: string;
let kenis: string;

async function lugar(nombre: string, padre: string | null, tipo: "site" | "plot" = "plot") {
  const l = await prisma.location.create({
    data: { name: `TEST ${nombre} (${RUN_ID})`, locationType: tipo, classification: "internal", organizationId, parentLocationId: padre },
  });
  return l.id;
}
async function persona(nombre: string) {
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: nombre, displayName: `TEST ${nombre} (${RUN_ID})`, locale: "es" },
  });
  return p.id;
}

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  finca = await lugar("Finca", null, "site");
  bodega = await lugar("Bodega", finca);
  apiario = await lugar("Apiario", finca);
  otraFinca = await lugar("Otra finca", null, "site");
  const ua = await prisma.userAccount.create({
    data: {
      person: { create: { givenName: "TEST", familyName: "Gestor", displayName: `TEST Gestor (${RUN_ID})`, locale: "es" } },
      authProvider: "credentials", status: "active",
    },
  });
  gestorId = ua.id;
  const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
  // Ámbito sobre la FINCA: por ADR-144 alcanza a la bodega y al apiario, que
  // cuelgan de ella, y NO a la otra finca.
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: finca } });
  await prisma.assignment.create({ data: { userAccountId: gestorId, roleProfileId: p.id, scopeId: scope.id } });
  const m = await crearMaterial(gestorId, { locationId: finca, organizationId, name: `Apivar ${RUN_ID}`, defaultUnit: "tira", isVeterinaryMedicine: true });
  materialId = m.id;
  bob = await persona("Bob");
  kenis = await persona("Kenis");
  // `exigirPersonaPermitida` sólo deja figurar a quien pertenece a la finca del
  // registro (o al equipo Néctar Nómada); sin esto los dos responsables quedan
  // fuera de `moverACustodia`.
  await prisma.organizationMembership.createMany({
    data: [bob, kenis].map((personId) => ({ personId, organizationId })),
  });
}, 30000);

afterAll(async () => {
  const lotes = await prisma.consumableLot.findMany({ where: { materialId }, select: { id: true } });
  const ids = lotes.map((l) => l.id);
  await prisma.consumableCustody.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: ids } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "consumable_custody" }) });
  await prisma.consumableStockEvent.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: ids } }) });
  await prisma.consumableLot.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ organizationId }) });
  const personas = await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } });
  const pid = personas.map((p) => p.id);
  const cuentas = await prisma.userAccount.findMany({ where: { personId: { in: pid } }, select: { id: true } });
  const cid = cuentas.map((c) => c.id);
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cid } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: finca }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cid } }) });
  await prisma.organizationMembership.deleteMany({ where: assertDefinedWhere({ personId: { in: pid } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: pid } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [bodega, apiario] } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [finca, otraFinca] } }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

async function loteDe(n: number, sufijo: string) {
  return recibirLote(gestorId, { locationId: bodega, materialId, batchLabel: `${sufijo}-${RUN_ID}`, quantity: n, unit: "tira" });
}

describe("la custodia de un frasco", () => {
  it("mover a custodia CIERRA la anterior y abre la nueva", async () => {
    const l = await loteDe(5, "mover");
    await moverACustodia(gestorId, { consumableLotId: l.id, locationId: bodega, responsiblePersonId: bob, desde: hace(10) });
    await moverACustodia(gestorId, { consumableLotId: l.id, locationId: apiario, responsiblePersonId: kenis, desde: hace(2) });
    const v = await custodiaVigente(gestorId, l.id);
    expect(v?.locationId).toBe(apiario);
    expect(v?.responsiblePersonId).toBe(kenis);
    const todas = await prisma.consumableCustody.findMany({ where: { consumableLotId: l.id } });
    expect(todas).toHaveLength(2);
    // Y la vieja NO se borra: queda cerrada, y cerrada cuando empezó la nueva.
    const vieja = todas.find((c) => c.locationId === bodega)!;
    // La vieja se cierra EXACTAMENTE cuando empieza la nueva: ni hueco, ni
    // solape. Un hueco sería un rato en que el frasco no estaba en ninguna
    // parte; un solape, en dos a la vez.
    expect(vieja.hasta).not.toBeNull();
    expect(vieja.hasta!.getTime()).toBe(v!.desde.getTime());
  }, 20000);

  it("nunca hay dos custodias abiertas del mismo lote — lo impone la BASE", async () => {
    // Índice único parcial: (consumable_lot_id) WHERE hasta IS NULL. Se prueba
    // escribiendo directo, rodeando el servicio.
    //
    // **Se exige el CAMPO, no el nombre del índice**, y se dice por qué: Prisma
    // informa una violación única por los campos —«Unique constraint failed on
    // the fields: (`consumable_lot_id`)»— y no por el nombre. Sigue
    // discriminando: sobre esa columna no hay OTRA restricción única que este
    // índice parcial, así que ese mensaje sólo lo puede producir él. Un
    // `toThrow()` pelado aceptaría cualquier error, y la Tarea 1 enseñó que así
    // una prueba pasa por la razón equivocada.
    const l = await loteDe(5, "dos");
    await prisma.consumableCustody.create({ data: { consumableLotId: l.id, locationId: bodega, desde: hace(3) } });
    await expect(prisma.consumableCustody.create({ data: { consumableLotId: l.id, locationId: apiario, desde: hace(1) } }))
      .rejects.toThrow(/Unique constraint failed on the fields: \(`consumable_lot_id`\)/);
  }, 20000);

  it("una custodia SIN persona se acepta — el sitio basta", async () => {
    const l = await loteDe(5, "sinpersona");
    const c = await moverACustodia(gestorId, { consumableLotId: l.id, locationId: bodega, desde: hace(1) });
    expect(c.responsiblePersonId).toBeNull();
  }, 20000);

  it("el responsable es una PERSONA sin cuenta, y se acepta", async () => {
    // Como `operatorPersonId`: quien guarda el frasco a menudo no tiene cuenta.
    const sinCuenta = await persona("Bodeguero");
    // Igual que `bob`/`kenis` en `beforeAll`: sin esto `exigirPersonaPermitida`
    // la rechaza por no pertenecer a la finca del registro.
    await prisma.organizationMembership.create({ data: { personId: sinCuenta, organizationId } });
    const l = await loteDe(5, "sincuenta");
    const c = await moverACustodia(gestorId, { consumableLotId: l.id, locationId: bodega, responsiblePersonId: sinCuenta, desde: hace(1) });
    expect(c.responsiblePersonId).toBe(sinCuenta);
  }, 20000);

  it("un lote sin custodia no tiene custodia vigente — nulo, no la ubicación de recepción", async () => {
    // La custodia vigente dice lo que se DECLARÓ. Rellenarla con dónde se
    // recibió sería inventar un movimiento que nadie registró; el aviso de la
    // Tarea 8 hará ese respaldo a la vista, no aquí escondido.
    const l = await loteDe(5, "sincustodia");
    expect(await custodiaVigente(gestorId, l.id)).toBeNull();
  }, 20000);

  it("no se puede mover a un sitio donde no se tiene permiso — y el control positivo", async () => {
    const l = await loteDe(5, "permiso");
    await expect(moverACustodia(gestorId, { consumableLotId: l.id, locationId: otraFinca, desde: hace(1) }))
      .rejects.toThrow(CustodiaError);
    await expect(moverACustodia(gestorId, { consumableLotId: l.id, locationId: apiario, desde: hace(1) }))
      .resolves.toBeTruthy();
  }, 20000);

  it("una custodia nueva ANTERIOR a la vigente se rechaza", async () => {
    // Si el frasco está en el apiario desde el martes, no se puede declarar que
    // pasó a la bodega el lunes: quedarían dos intervalos que se pisan.
    const l = await loteDe(5, "anterior");
    await moverACustodia(gestorId, { consumableLotId: l.id, locationId: apiario, desde: hace(2) });
    await expect(moverACustodia(gestorId, { consumableLotId: l.id, locationId: bodega, desde: hace(5) }))
      .rejects.toThrow(CustodiaError);
  }, 20000);
});
