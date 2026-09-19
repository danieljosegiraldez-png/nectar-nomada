/**
 * Proveedores de fuera y pedidos de cereza — spec recepción §3.2–3.3. Plan: Tarea 4.
 * Grupo `base-sembrada`: necesita los perfiles sembrados, con `cherry_supplier:create`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearProveedorDeCereza } from "../../lib/traceability/proveedoresDeCereza";
import { cantidadDelPedido, cerrarPedido, crearPedido, pedidosDeBeneficio } from "../../lib/traceability/pedidosDeCereza";

const RUN = `ped-${Date.now()}`;
const personas: string[] = [];
const cuentas: string[] = [];
const scopes: string[] = [];
const orgs: string[] = [];
const hoy = new Date(new Date().toISOString().slice(0, 10));

let finca: string;
let beneficio: string;
let otraFinca: string;
let operador: string;
let recolector: string;
let managerOtra: string;
let proveedor: string;

async function cuenta(perfil: string, siteId: string) {
  const personId = randomUUID();
  await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: perfil, displayName: `TEST ${perfil} (${RUN})` } });
  personas.push(personId);
  const id = randomUUID();
  await prisma.userAccount.create({ data: { id, personId, status: "active", authProvider: "credentials" } });
  cuentas.push(id);
  const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: siteId } });
  const s = existente ?? (await prisma.scope.create({ data: { id: randomUUID(), scopeType: "location", scopeRefId: siteId } }));
  if (!existente) scopes.push(s.id);
  await prisma.assignment.create({ data: { userAccountId: id, scopeId: s.id, roleProfileId: rp.id } });
  return id;
}
async function sitio(n: string) {
  const org = await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${n} (${RUN})`, status: "approved", classification: "internal" } });
  orgs.push(org.id);
  return (await prisma.location.create({ data: { name: `TEST ${n} (${RUN})`, locationType: "site", organizationId: org.id, classification: "internal" } })).id;
}

beforeAll(async () => {
  finca = await sitio("Finca");
  beneficio = (await prisma.location.create({ data: { name: `TEST Beneficio (${RUN})`, locationType: "beneficio", parentLocationId: finca, classification: "internal" } })).id;
  otraFinca = await sitio("Otra finca");
  operador = await cuenta("Farm Operator", finca);
  recolector = await cuenta("Recolector", finca);
  managerOtra = await cuenta("Farm Manager", otraFinca);
}, 30000);

afterAll(async () => {
  const pedidos = (await prisma.pedidoDeCereza.findMany({ where: { beneficioId: beneficio }, select: { id: true } })).map((p) => p.id);
  const proveedores = (await prisma.organization.findMany({ where: { organizationType: "producer", name: { contains: RUN } }, select: { id: true } })).map((o) => o.id);
  await prisma.recepcionDeCereza.deleteMany({ where: assertDefinedWhere({ beneficioId: beneficio }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...pedidos, ...proveedores] } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.pedidoDeCereza.deleteMany({ where: assertDefinedWhere({ id: { in: pedidos } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: beneficio }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [finca, otraFinca] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: [...orgs, ...proveedores] } }) });
}, 30000);

describe("el proveedor de fuera", () => {
  it("el Farm Operator lo da de alta; el mismo nombre en minúsculas se rechaza", async () => {
    const p = await crearProveedorDeCereza(operador, { nombre: `Don Pedro ${RUN}`, lugar: "Boquete" });
    proveedor = p.id;
    expect(p.organizationType).toBe("producer");
    expect(p.description).toBe("Boquete");
    await expect(crearProveedorDeCereza(operador, { nombre: `don pedro ${RUN}` })).rejects.toThrow(/proveedor_repetido/);
  }, 20000);

  it("el Recolector no da de alta proveedores", async () => {
    await expect(crearProveedorDeCereza(recolector, { nombre: `Otro ${RUN}` })).rejects.toThrow(/sin_permiso/);
  }, 20000);
});

describe("el pedido", () => {
  it("con dos fuentes, o ninguna, se rechaza en la base; con una, entra", async () => {
    const base = { beneficioId: beneficio, fecha: hoy, kgPedidos: 500, margenCantidadPct: 2 };
    await expect(prisma.pedidoDeCereza.create({ data: { ...base, fincaSiteId: finca, proveedorId: proveedor } })).rejects.toThrow(/pedido_de_cereza_una_fuente/);
    await expect(prisma.pedidoDeCereza.create({ data: base })).rejects.toThrow(/pedido_de_cereza_una_fuente/);
    const p = await crearPedido(operador, { ...base, fuente: { proveedorId: proveedor }, maxVerdePct: 5 });
    expect(p.proveedorId).toBe(proveedor);
    expect(Number(p.maxVerdePct)).toBe(5);
  }, 20000);

  it("un Farm Manager de otra finca no pide para este beneficio", async () => {
    await expect(
      crearPedido(managerOtra, { beneficioId: beneficio, fuente: { proveedorId: proveedor }, fecha: hoy, kgPedidos: 100, margenCantidadPct: 0 }),
    ).rejects.toThrow();
  }, 20000);

  it("la cantidad: 520 de 500 con 2 % es exceso de 20 kg (+4 %); 505 no", () => {
    const c = cantidadDelPedido(500, 520, 2);
    expect(c.diferenciaKg).toBe(20);
    expect(c.diferenciaPct).toBeCloseTo(0.04, 10);
    expect(c.exceso).toBe(true);
    expect(cantidadDelPedido(500, 505, 2).exceso).toBe(false);
    expect(cantidadDelPedido(500, 300, 2).falta).toBe(true);
  });

  it("cerrar con 300 de 500 exige nota; con nota, se cierra; la lista dice lo recibido", async () => {
    const p = await crearPedido(operador, { beneficioId: beneficio, fuente: { proveedorId: proveedor }, fecha: hoy, kgPedidos: 500, margenCantidadPct: 2 });
    await prisma.recepcionDeCereza.create({
      data: {
        claveDeEnvio: randomUUID(), beneficioId: beneficio, proveedorId: proveedor, pedidoId: p.id, recibidaPor: operador,
        recibidaAt: new Date(), brutoKg: 300, recipientes: 0, taraPorRecipienteKg: 0, netoKg: 300,
      },
    });
    const lista = await pedidosDeBeneficio(operador, beneficio);
    const este = lista.find((x) => x.id === p.id)!;
    expect(este.recibidoKg).toBe(300);
    expect(este.falta).toBe(true);
    await expect(cerrarPedido(operador, { pedidoId: p.id })).rejects.toThrow(/nota_obligatoria/);
    const cerrado = await cerrarPedido(operador, { pedidoId: p.id, nota: "el productor no tenía más" });
    expect(cerrado.estado).toBe("cerrado");
  }, 20000);
});
