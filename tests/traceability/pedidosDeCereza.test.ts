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
  const proveedores = (await prisma.organization.findMany({ where: { organizationType: "producer", name: { contains: RUN, mode: "insensitive" } }, select: { id: true } })).map((o) => o.id);
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
    const p = await crearProveedorDeCereza(operador, beneficio, { nombre: `Don Pedro ${RUN}`, lugar: "Boquete" });
    proveedor = p.id;
    expect(p.organizationType).toBe("producer");
    expect(p.description).toBe("Boquete");
    // Hallazgo 1 de Codex: el beneficio que autorizó el alta tiene que quedar en la auditoría, o
    // una cuenta con acceso a varios no deja ver cuál la justificó. Se comprueba aquí y no con una
    // sonda posterior porque el `afterAll` de este archivo borra estos eventos.
    const ev = await prisma.auditEvent.findFirstOrThrow({
      where: { operation: "organization.create_cherry_supplier", entityId: p.id },
      select: { after: true },
    });
    const despues = ev.after as Record<string, unknown>;
    expect(despues.autorizadoEnBeneficio, "el AuditEvent no dice en qué beneficio se autorizó").toBe(beneficio);
    // Control: el evento sigue trayendo lo de siempre, así que la aserción de arriba mide un campo
    // añadido y no un objeto que se haya quedado a medias.
    expect(despues.name).toBe(`Don Pedro ${RUN}`);
    await expect(crearProveedorDeCereza(operador, beneficio, { nombre: `don pedro ${RUN}` })).rejects.toThrow(/proveedor_repetido/);
  }, 20000);

  it("dos altas a la vez del mismo nombre: una entra, la otra es proveedor_repetido", async () => {
    // Revisión de Codex, hallazgo 4: la consulta previa no basta; el índice único es la red.
    // Nombre ASCII a propósito: lo que se prueba es la carrera. Las mayúsculas acentuadas no se
    // pliegan con la colación C (ver el comentario del índice en la migración).
    const nombre = `Dona Rosa ${RUN}`;
    const res = await Promise.allSettled([crearProveedorDeCereza(operador, beneficio, { nombre }), crearProveedorDeCereza(operador, beneficio, { nombre: nombre.toUpperCase() })]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((res.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/proveedor_repetido/);
  }, 20000);

  it("un Farm Manager de OTRA finca no da de alta en este beneficio — el ámbito manda", async () => {
    // Éste es el discriminante del cambio del 2026-09-29. `managerOtra` TIENE `cherry_supplier:create`
    // por su perfil, pero en otro sitio: con `permissionKeysAnywhere` la unión de sus ámbitos bastaba
    // y podía dar de alta aquí. Ahora el permiso se juzga contra el beneficio donde se recibe.
    // `no_lot_access` y no `sin_permiso`: quien no alcanza el beneficio se cae en `exigeVerBeneficio`
    // ANTES de llegar a la clave. Son dos rechazos distintos y la prueba nombra el que ocurre; los
    // dos salen por pantalla como «no tienes permiso» (`traducir` en app/actions/recepcionDeCereza).
    await expect(crearProveedorDeCereza(managerOtra, beneficio, { nombre: `Ajeno ${RUN}` })).rejects.toThrow(/no_lot_access/);
    // Control positivo: el operador de ESTE beneficio sí puede, así que el rechazo es del ámbito y
    // no de una operación rota.
    const p = await crearProveedorDeCereza(operador, beneficio, { nombre: `Ajeno ${RUN}` });
    expect(p.organizationType).toBe('producer');
  }, 20000);

  it("alcanzar el beneficio NO basta: sin `cherry_supplier:create` sale sin_permiso", async () => {
    // Hallazgo 3 de Codex, y tenía razón: los dos rechazos de arriba caen en `exigeVerBeneficio`, así
    // que quitar el `can(cherry_supplier:create)` entero los dejaba intactos — medido, 0 caídas. Esta
    // aísla la SEGUNDA barrera: al operador se le quita sólo esa clave con un override `deny`, sin
    // tocar su acceso al beneficio, y el rechazo pasa de `no_lot_access` a `sin_permiso`.
    const asignacion = await prisma.assignment.findFirstOrThrow({ where: { userAccountId: operador } });
    const permiso = await prisma.permission.findFirstOrThrow({ where: { resourceType: "cherry_supplier", action: "create" } });
    const veto = await prisma.assignmentPermissionOverride.create({
      data: { assignmentId: asignacion.id, permissionId: permiso.id, effect: "deny", createdBy: operador, reason: null },
    });
    try {
      await expect(crearProveedorDeCereza(operador, beneficio, { nombre: `Vetado ${RUN}` })).rejects.toThrow(/sin_permiso/);
    } finally {
      await prisma.assignmentPermissionOverride.delete({ where: { id: veto.id } });
    }
    // Control positivo: devuelta la clave, el mismo nombre entra. El rechazo era de la clave y no
    // del beneficio, que es justo lo que las otras dos pruebas no podían distinguir.
    const p = await crearProveedorDeCereza(operador, beneficio, { nombre: `Vetado ${RUN}` });
    expect(p.organizationType).toBe("producer");
  }, 20000);

  it("el Recolector no da de alta proveedores", async () => {
    // Igual que el de arriba: el recolector no alcanza el beneficio, así que cae en el guardia del
    // ámbito. Antes del 2026-09-29 llegaba hasta la clave y salía `sin_permiso`.
    await expect(crearProveedorDeCereza(recolector, beneficio, { nombre: `Otro ${RUN}` })).rejects.toThrow(/no_lot_access/);
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
    // Revisión de Codex, hallazgo 8: el borde exacto. En coma flotante 100 × 1,13 = 112,999…
    expect(cantidadDelPedido(100, 113, 13).exceso).toBe(false);
    expect(cantidadDelPedido(100, 113.001, 13).exceso).toBe(true);
    expect(cantidadDelPedido(100, 87, 13).falta).toBe(false);
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
