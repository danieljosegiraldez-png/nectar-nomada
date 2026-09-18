/**
 * El lote que entró — Tarea 2 del plan de inventario.
 *
 * **Un lote sin su evento de entrada es un lote que nunca llegó**, así que los
 * dos nacen juntos y en la misma transacción. El plan ponía el libro mayor en la
 * tarea siguiente; separarlos habría permitido un lote de gallinaza que existe y
 * del que nadie sabe cuánto entró.
 *
 * Y **el saldo no se guarda**: se deriva al leer (Tarea 3). Un saldo guardado y
 * un libro mayor dejan de cuadrar en silencio.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { crearMaterial } from "../../lib/inventario/materiales";
import { recibirLote, LoteValidationError, LoteAccessError } from "../../lib/inventario/lotes";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `lot-${Date.now()}`;

let organizationId: string;
let projectId: string;
let gestorId: string;
let operarioId: string;
let materialId: string;

async function cuenta(label: string, perfil: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  const ua = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "project", scopeRefId: projectId } })) ??
    (await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } }));
  await prisma.assignment.create({ data: { userAccountId: ua.id, roleProfileId: p.id, scopeId: scope.id } });
  return ua.id;
}

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  const proyecto = await prisma.project.create({
    data: { name: `TEST Lotes (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = proyecto.id;
  gestorId = await cuenta("Gestor", "Farm Manager");
  operarioId = await cuenta("Operario", "Farm Operator");
  const m = await crearMaterial(gestorId, { projectId, organizationId, name: `Gallinaza ${RUN_ID}`, defaultUnit: "quintal" });
  materialId = m.id;
}, 30000);

afterAll(async () => {
  const lotes = await prisma.consumableLot.findMany({ where: { materialId }, select: { id: true } });
  const ids = lotes.map((l) => l.id);
  await prisma.consumableStockEvent.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: ids } }) });
  await prisma.consumableLot.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ organizationId }) });
  // Se borran TODAS las cuentas de esta corrida, no sólo las dos nombradas:
  // `cuentaSinAmbito()` crea una tercera, y dejarla convertía la limpieza en
  // filas huérfanas en una base que comparten otras sesiones.
  const personas = await prisma.person.findMany({
    where: { displayName: { contains: RUN_ID } }, select: { id: true },
  });
  const personaIds = personas.map((p) => p.id);
  const cuentas = await prisma.userAccount.findMany({
    where: { personId: { in: personaIds } }, select: { id: true },
  });
  const cuentaIds = cuentas.map((c) => c.id);
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentaIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentaIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personaIds } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

describe("el lote que entró", () => {
  it("recibir crea el lote Y su evento de entrada, en la misma transacción", async () => {
    const l = await recibirLote(gestorId, {
      projectId, materialId, batchLabel: "GAL-2026-07",
      quantity: 28, unit: "quintal", occurredAt: new Date("2026-07-01"),
    });
    const eventos = await prisma.consumableStockEvent.findMany({ where: { consumableLotId: l.id } });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.eventType).toBe("received");
    expect(Number(eventos[0]!.quantity)).toBe(28);
  }, 20000);

  it("el lote NO tiene columna de saldo — el saldo se deriva", async () => {
    // El guardia del diseño. Si alguien añade `stock`, un número guardado y un
    // libro mayor empiezan a discrepar en silencio y nadie sabe cuál manda.
    const columnas: Array<{ column_name: string }> = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='traceability' AND table_name='consumable_lot'`);
    const nombres = columnas.map((c) => c.column_name);
    expect(nombres).toContain("batch_label");           // control: la consulta ve la tabla
    expect(nombres).not.toContain("stock");
    expect(nombres).not.toContain("quantity_remaining");
  }, 20000);

  it("dos lotes del mismo material no se mezclan", async () => {
    // Dos sacos de gallinaza de proveedores distintos no son intercambiables
    // el día que uno sale malo.
    const a = await recibirLote(gestorId, { projectId, materialId, batchLabel: `A-${RUN_ID}`, quantity: 10, unit: "quintal" });
    const b = await recibirLote(gestorId, { projectId, materialId, batchLabel: `B-${RUN_ID}`, quantity: 5, unit: "quintal" });
    expect(a.id).not.toBe(b.id);
    const ea = await prisma.consumableStockEvent.findMany({ where: { consumableLotId: a.id } });
    const eb = await prisma.consumableStockEvent.findMany({ where: { consumableLotId: b.id } });
    expect(Number(ea[0]!.quantity)).toBe(10);
    expect(Number(eb[0]!.quantity)).toBe(5);
  }, 20000);

  it("la misma etiqueta dos veces para el mismo material se rechaza", async () => {
    await recibirLote(gestorId, { projectId, materialId, batchLabel: `UNICO-${RUN_ID}`, quantity: 1, unit: "quintal" });
    await expect(recibirLote(gestorId, { projectId, materialId, batchLabel: `UNICO-${RUN_ID}`, quantity: 1, unit: "quintal" }))
      .rejects.toThrow(/ya_existe/);
  }, 20000);

  it("una cantidad negativa se rechaza — y CERO es válido", async () => {
    // Cero es un dato: llegó el camión y el saco venía vacío, o se recibió para
    // dejar constancia y pesar después. Un negativo no significa nada.
    await expect(recibirLote(gestorId, { projectId, materialId, batchLabel: `NEG-${RUN_ID}`, quantity: -1, unit: "quintal" }))
      .rejects.toThrow(LoteValidationError);
    await expect(recibirLote(gestorId, { projectId, materialId, batchLabel: `CERO-${RUN_ID}`, quantity: 0, unit: "quintal" }))
      .resolves.toBeTruthy();
  }, 20000);

  it("un Farm Operator SÍ puede recibir — recibir es faena, no gestión", async () => {
    // La otra mitad del reparto de la Tarea 1: definir qué es «gallinaza» es
    // gestión; anotar que entraron 28 quintales lo hace quien descarga el
    // camión. Si esto cayera, el inventario dependería de que el gerente esté.
    await expect(recibirLote(operarioId, { projectId, materialId, batchLabel: `OP-${RUN_ID}`, quantity: 3, unit: "quintal" }))
      .resolves.toBeTruthy();
  }, 20000);

  it("pero sin ámbito NO puede — el control negativo del anterior", async () => {
    const ajeno = await cuentaSinAmbito();
    await expect(recibirLote(ajeno, { projectId, materialId, batchLabel: `AJENO-${RUN_ID}`, quantity: 1, unit: "quintal" }))
      .rejects.toThrow(LoteAccessError);
  }, 20000);
});

async function cuentaSinAmbito() {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Ajeno", displayName: `TEST Ajeno (${RUN_ID})`, locale: "es" },
  });
  const ua = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return ua.id;
}
/**
 * El botiquín, Tarea 2: lo que se escribe en CADA COMPRA.
 *
 * Vencimiento, proveedor con dirección, factura y presentación. Del frasco y no
 * del producto: dos frascos del mismo Apivar vencen en fechas distintas y
 * vienen de facturas distintas. `batchLabel` ya es el lote del fabricante y
 * `supplier` ya existía.
 *
 * Dirección del proveedor y evidencia de adquisición son literales del
 * Reglamento (UE) 2019/6 art. 108; la caducidad, de la NOM-064-ZOO-2000.
 */
describe("el frasco que entró", () => {
  it("guarda vencimiento, dirección del proveedor, factura y presentación", async () => {
    const l = await recibirLote(gestorId, {
      projectId, materialId, batchLabel: `FR-${RUN_ID}`, quantity: 10, unit: "quintal",
      expiresAt: new Date("2027-03-31T00:00:00Z"),
      supplier: "Agroveterinaria El Valle", supplierAddress: "Boquete, Chiriquí",
      invoiceReference: "F-0042", presentation: "sobre de 10 tiras",
    });
    expect(l.expiresAt?.toISOString().slice(0, 10)).toBe("2027-03-31");
    expect(l.supplier).toBe("Agroveterinaria El Valle");
    expect(l.supplierAddress).toBe("Boquete, Chiriquí");
    expect(l.invoiceReference).toBe("F-0042");
    expect(l.presentation).toBe("sobre de 10 tiras");
  }, 20000);

  it("un frasco SIN fecha de vencimiento se acepta y queda NULO — no «vigente»", async () => {
    // Lo desconocido no se convierte en bueno. Un nulo aquí lo leerá el estado
    // de vencimiento (Tarea 3) como «sin fecha», nunca como «vigente».
    const l = await recibirLote(gestorId, { projectId, materialId, batchLabel: `SF-${RUN_ID}`, quantity: 1, unit: "quintal" });
    expect(l.expiresAt).toBeNull();
    expect(l.supplierAddress).toBeNull();
  }, 20000);

  it("un frasco ya vencido AL RECIBIRLO se acepta igual — avisa, no bloquea", async () => {
    // Se puede estar registrando hoy una compra vieja. Rechazarlo haría que el
    // frasco existiera en la bodega y no en el sistema.
    const l = await recibirLote(gestorId, {
      projectId, materialId, batchLabel: `YV-${RUN_ID}`, quantity: 1, unit: "quintal",
      expiresAt: new Date("2020-01-01T00:00:00Z"),
    });
    // Y se GUARDA la fecha: sin esta línea la prueba pasaba antes de
    // implementar nada, porque el servicio ignoraba el campo en vez de aceptarlo.
    expect(l.expiresAt?.toISOString().slice(0, 10)).toBe("2020-01-01");
  }, 20000);

  it("una fecha de vencimiento inválida se rechaza en vez de guardarse", async () => {
    // `new Date("patata")` es un Date válido para TypeScript e Invalid Date en
    // ejecución. Guardarlo sería inventar una fecha.
    await expect(recibirLote(gestorId, {
      projectId, materialId, batchLabel: `BAD-${RUN_ID}`, quantity: 1, unit: "quintal",
      expiresAt: new Date("no es una fecha"),
    })).rejects.toThrow(LoteValidationError);
  }, 20000);
});
