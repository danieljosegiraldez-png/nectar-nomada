/**
 * La recepción de cereza en el beneficio — spec recepción §3.4. Plan: Tarea 5.
 *
 * El recolector (perfil Recolector) y el capataz que anota (Farm Operator de la finca) son la
 * finca; el receptor es OTRA cuenta Farm Operator de la misma finca, cuyo ámbito alcanza al
 * beneficio que cuelga de su sitio. Grupo `base-sembrada`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { abrirJornada, agregarRecolector, cambiarDestinoDeJornada } from "../../lib/traceability/jornadasDeCosecha";
import { anotarEntrega } from "../../lib/traceability/entregasDeCosecha";
import { cerrarPedido, crearPedido } from "../../lib/traceability/pedidosDeCereza";
import { anularRecepcion, pendientesDeBeneficio, recibirCereza, type RecibirCerezaInput } from "../../lib/traceability/recepcionesDeCereza";

const RUN = `recep-${Date.now()}`;
const personas: string[] = [];
const cuentas: string[] = [];
const scopes: string[] = [];
const orgs: string[] = [];
const hoy = new Date(new Date().toISOString().slice(0, 10));

let finca: string;
let parcela: string;
let beneficio: string;
let beneficio2: string;
let otraFinca: string;
let otroBeneficio: string;
let jornada: string;
let jornadaAjena: string;
let recolector: string;
let cuentaRecolector: string;
let capataz: string;
let receptor: string;
let managerOtra: string;
let proveedor: string;
let otroProveedor: string;

async function persona(n: string) {
  const id = randomUUID();
  await prisma.person.create({ data: { id, givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN})` } });
  personas.push(id);
  return id;
}
async function cuenta(personId: string, perfil: string, siteId: string) {
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
async function org(tipo: "farm" | "producer", n: string) {
  const o = await prisma.organization.create({ data: { organizationType: tipo, name: `TEST ${n} (${RUN})`, status: "approved", classification: "internal" } });
  orgs.push(o.id);
  return o.id;
}
const loc = async (n: string, tipo: "site" | "plot" | "beneficio", extra: Record<string, string>) =>
  (await prisma.location.create({ data: { name: `TEST ${n} (${RUN})`, locationType: tipo, classification: "internal", ...extra } })).id;

beforeAll(async () => {
  finca = await loc("Finca", "site", { organizationId: await org("farm", "Finca") });
  parcela = await loc("Parcela", "plot", { parentLocationId: finca });
  beneficio = await loc("Beneficio", "beneficio", { parentLocationId: finca });
  beneficio2 = await loc("Beneficio 2", "beneficio", { parentLocationId: finca });
  otraFinca = await loc("Otra finca", "site", { organizationId: await org("farm", "Otra finca") });
  otroBeneficio = await loc("Otro beneficio", "beneficio", { parentLocationId: otraFinca });
  proveedor = await org("producer", "Don Pedro");
  otroProveedor = await org("producer", "Doña Ana");
  recolector = await persona("Recolector");
  cuentaRecolector = await cuenta(recolector, "Recolector", finca);
  capataz = await cuenta(await persona("Capataz"), "Farm Operator", finca);
  receptor = await cuenta(await persona("Receptor"), "Farm Operator", finca);
  managerOtra = await cuenta(await persona("Manager otra"), "Farm Manager", otraFinca);
  await agregarRecolector(capataz, { fincaSiteId: finca, personId: recolector, desde: new Date(hoy.getTime() - 86_400_000) });
  // El destino ya no se pasa a `abrirJornada`: lo lleva la finca y la jornada lo COPIA (ADR-194).
  await prisma.location.update({ where: { id: finca }, data: { beneficioDestinoId: beneficio } });
  jornada = (await abrirJornada(capataz, { fincaSiteId: finca, fecha: hoy, asignaciones: [{ locationId: parcela, personId: recolector }] })).id;
  // Una jornada de ESTA finca con destino a OTRO beneficio: se escribe directo, porque el capataz no
  // ve ese beneficio y el servicio no le dejaría elegirlo.
  jornadaAjena = (
    await prisma.jornadaDeCosecha.create({
      data: { fincaSiteId: finca, beneficioId: otroBeneficio, fecha: hoy, asignaciones: { create: [{ locationId: parcela, personId: recolector }] } },
    })
  ).id;
}, 30000);

afterAll(async () => {
  const jornadas = (await prisma.jornadaDeCosecha.findMany({ where: { fincaSiteId: finca }, select: { id: true } })).map((j) => j.id);
  const entregas = (await prisma.entregaDeCosecha.findMany({ where: { jornadaId: { in: jornadas } }, select: { id: true } })).map((e) => e.id);
  const recepciones = (await prisma.recepcionDeCereza.findMany({ where: { beneficioId: { in: [beneficio, beneficio2, otroBeneficio] } }, select: { id: true } })).map((r) => r.id);
  const pedidos = (await prisma.pedidoDeCereza.findMany({ where: { beneficioId: beneficio }, select: { id: true } })).map((p) => p.id);
  const recolectores = (await prisma.fincaRecolector.findMany({ where: { fincaSiteId: finca }, select: { id: true } })).map((r) => r.id);
  await prisma.recepcionDeCereza.deleteMany({ where: assertDefinedWhere({ id: { in: recepciones } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...jornadas, ...entregas, ...recepciones, ...pedidos, ...recolectores] } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.pedidoDeCereza.deleteMany({ where: assertDefinedWhere({ id: { in: pedidos } }) });
  await prisma.entregaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: entregas } }) });
  await prisma.jornadaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: jornadas } }) });
  await prisma.fincaRecolector.deleteMany({ where: assertDefinedWhere({ id: { in: recolectores } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  // La FK del destino es RESTRICT: sin soltarlo, borrar el beneficio lanza y —siendo el
  // `afterAll` una cadena— abandona los borrados de abajo.
  await prisma.location.updateMany({ where: assertDefinedWhere({ beneficioDestinoId: { in: [beneficio, beneficio2, otroBeneficio] } }), data: { beneficioDestinoId: null } });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [parcela, beneficio, beneficio2, otroBeneficio] } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [finca, otraFinca] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgs } }) });
}, 30000);

async function entrega(pesoFincaKg = 20, jornadaId = jornada) {
  if (jornadaId === jornada) {
    return (await anotarEntrega(capataz, { jornadaId, recolectorPersonId: recolector, origen: { locationId: parcela }, pesoFincaKg, enviadaAt: new Date() })).id;
  }
  return (
    await prisma.entregaDeCosecha.create({
      data: { jornadaId, recolectorId: recolector, locationId: parcela, pesoFincaKg, enviadaAt: new Date(), anotadaPor: capataz },
    })
  ).id;
}

/** Bruto 21 con 2 recipientes de 0,5: neto 20. */
function recibir(quien: string, entregaId: string, extra: Partial<RecibirCerezaInput> = {}) {
  return recibirCereza(quien, {
    claveDeEnvio: randomUUID(), beneficioId: beneficio, origen: { entregaId }, recibidaAt: new Date(),
    brutoKg: 21, recipientes: 2, taraPorRecipienteKg: 0.5, ...extra,
  });
}

describe("recibir una entrega de la finca", () => {
  it("el receptor la recibe: neto 20, BALANCED, sin nota, y sale de pendientes", async () => {
    const e = await entrega();
    expect((await pendientesDeBeneficio(receptor, beneficio)).map((p) => p.id)).toContain(e);
    const r = await recibir(receptor, e);
    expect(Number(r.netoKg)).toBe(20);
    expect(r.comparacion).toBe("BALANCED");
    expect(await prisma.auditEvent.findFirst({ where: { entityId: r.id, operation: "cherry_reception.create" } })).not.toBeNull();
    expect((await pendientesDeBeneficio(receptor, beneficio)).map((p) => p.id)).not.toContain(e);
  }, 20000);

  it("quien la anotó no la recibe; su recolector con cuenta tampoco", async () => {
    const e = await entrega();
    await expect(recibir(capataz, e)).rejects.toThrow(/misma_persona/);
    await expect(recibir(cuentaRecolector, e)).rejects.toThrow();
  }, 20000);

  it("el recolector que ADEMÁS gestiona el beneficio tampoco recibe su entrega: misma_persona", async () => {
    // Revisión de Codex, hallazgo 10: sin `lot:manage`, el recolector caía por permiso y la regla
    // de dos personas del servicio quedaba sin probar.
    const scope = await prisma.scope.findFirstOrThrow({ where: { scopeType: "location", scopeRefId: finca } });
    const fo = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const extra = await prisma.assignment.create({ data: { userAccountId: cuentaRecolector, scopeId: scope.id, roleProfileId: fo.id } });
    try {
      await expect(recibir(cuentaRecolector, await entrega())).rejects.toThrow(/misma_persona/);
    } finally {
      await prisma.assignment.delete({ where: { id: extra.id } });
    }
  }, 20000);

  it("una entrega con destino a OTRO beneficio, mandada por id, no se recibe aquí", async () => {
    const e = await entrega(20, jornadaAjena);
    await expect(recibir(receptor, e)).rejects.toThrow(/otro_destino/);
  }, 20000);

  it("un Farm Manager de otra finca, sin lot:manage sobre el beneficio, no recibe", async () => {
    const e = await entrega();
    await expect(recibir(managerOtra, e)).rejects.toThrow();
  }, 20000);

  it("fuera de tolerancia exige nota; con nota entra; un desbalance grueso también se guarda", async () => {
    const e = await entrega();
    // Neto 20,8 contra 20: +0,8 kg pasa el piso de 0,5 y no llega al 5 % (1 kg).
    await expect(recibir(receptor, e, { brutoKg: 21.8 })).rejects.toThrow(/nota_obligatoria/);
    const r = await recibir(receptor, e, { brutoKg: 21.8, nota: "sacos mojados" });
    expect(r.comparacion).toBe("DISCREPANCY_FLAGGED");
    const grueso = await recibir(receptor, await entrega(), { brutoKg: 40, nota: "¿otra entrega mezclada?" });
    expect(grueso.comparacion).toBe("GROSS_IMBALANCE");
  }, 20000);

  it("la misma clave de envío dos veces guarda una sola recepción", async () => {
    const e = await entrega();
    const clave = randomUUID();
    const a = await recibir(receptor, e, { claveDeEnvio: clave });
    const b = await recibir(receptor, e, { claveDeEnvio: clave });
    expect(b.id).toBe(a.id);
    expect(await prisma.recepcionDeCereza.count({ where: { claveDeEnvio: clave } })).toBe(1);
  }, 20000);

  it("el mismo envío dos veces A LA VEZ devuelve la misma recepción, no «ya recibida»", async () => {
    const e = await entrega();
    const clave = randomUUID();
    const [a, b] = await Promise.all([recibir(receptor, e, { claveDeEnvio: clave }), recibir(receptor, e, { claveDeEnvio: clave })]);
    expect(b.id).toBe(a.id);
    expect(await prisma.recepcionDeCereza.count({ where: { claveDeEnvio: clave } })).toBe(1);
  }, 20000);

  it("un reintento con la clave de otro no sirve a quien no gestiona ese beneficio", async () => {
    const e = await entrega();
    const clave = randomUUID();
    await recibir(receptor, e, { claveDeEnvio: clave });
    await expect(recibir(managerOtra, e, { claveDeEnvio: clave })).rejects.toThrow();
  }, 20000);

  it("recibir y cambiar el destino a la vez: si queda recibida, el destino es el de la recepción", async () => {
    const j = await abrirJornada(capataz, { fincaSiteId: finca, fecha: hoy, asignaciones: [{ locationId: parcela, personId: recolector }] });
    const e = (await anotarEntrega(capataz, { jornadaId: j.id, recolectorPersonId: recolector, origen: { locationId: parcela }, pesoFincaKg: 20, enviadaAt: new Date() })).id;
    await Promise.allSettled([recibir(receptor, e), cambiarDestinoDeJornada(capataz, { jornadaId: j.id, beneficioId: beneficio2 })]);
    const vigente = await prisma.recepcionDeCereza.findFirst({ where: { entregaId: e, estado: { not: "anulada" } } });
    const final = await prisma.jornadaDeCosecha.findUniqueOrThrow({ where: { id: j.id } });
    // Revisión de Codex, hallazgo 1: nunca una recepción en A con la jornada ya en B.
    if (vigente) expect(final.beneficioId).toBe(vigente.beneficioId);
    else expect(final.beneficioId).toBe(beneficio2);
  }, 20000);

  it("dos recibos simultáneos de la misma entrega: exactamente uno entra", async () => {
    const e = await entrega();
    const resultados = await Promise.allSettled([recibir(receptor, e), recibir(receptor, e)]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.recepcionDeCereza.count({ where: { entregaId: e, estado: { not: "anulada" } } })).toBe(1);
  }, 20000);

  it("el Brix se guarda con su veredicto, también fuera de rango", async () => {
    const r = await recibir(receptor, await entrega(), { brix: { valor: 19, puntoDeMuestreo: "CHERRY_PULP" } });
    expect(r.veredictoBrix).toBe("INTAKE_OPTIMAL");
    const f = await recibir(receptor, await entrega(), { brix: { valor: 35, puntoDeMuestreo: "CHERRY_PULP" } });
    expect(f.veredictoBrix).toBe("SENSOR_FAULT");
    // Revisión de Codex, hallazgo 9: se evalúa lo que se guarda. 17,999 se guarda 18,00: óptimo.
    const borde = await recibir(receptor, await entrega(), { brix: { valor: 17.999, puntoDeMuestreo: "CHERRY_PULP" } });
    expect(Number(borde.brix)).toBe(18);
    expect(borde.veredictoBrix).toBe("INTAKE_OPTIMAL");
    await expect(recibir(receptor, await entrega(), { brix: { valor: Number.NaN, puntoDeMuestreo: "CHERRY_PULP" } })).rejects.toThrow(/brix_invalido/);
  }, 20000);

  it("rechazar exige motivo; rechazada, su estado lo dice", async () => {
    const e = await entrega();
    await expect(recibir(receptor, e, { rechazo: { motivo: " " } })).rejects.toThrow(/motivo_obligatorio/);
    const r = await recibir(receptor, e, { rechazo: { motivo: "fermentada" } });
    expect(r.estado).toBe("rechazada");
  }, 20000);

  it("dos anulaciones a la vez: una entra, la otra ve «ya anulada», y la firma no se reescribe", async () => {
    const r = await recibir(receptor, await entrega());
    const res = await Promise.allSettled([
      anularRecepcion(receptor, { recepcionId: r.id, motivo: "primera" }),
      anularRecepcion(receptor, { recepcionId: r.id, motivo: "segunda" }),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const ganadora = (res.find((x) => x.status === "fulfilled") as PromiseFulfilledResult<{ motivoAnulacion: string | null }>).value;
    const fila = await prisma.recepcionDeCereza.findUniqueOrThrow({ where: { id: r.id } });
    expect(fila.motivoAnulacion).toBe(ganadora.motivoAnulacion);
  }, 20000);

  it("anular devuelve la entrega a pendiente; quien la anotó no puede anularla", async () => {
    const e = await entrega();
    const r = await recibir(receptor, e);
    await expect(anularRecepcion(capataz, { recepcionId: r.id, motivo: "error" })).rejects.toThrow(/misma_persona/);
    const anulada = await anularRecepcion(receptor, { recepcionId: r.id, motivo: "se pesó en otra báscula" });
    expect(anulada.estado).toBe("anulada");
    expect((await pendientesDeBeneficio(receptor, beneficio)).map((p) => p.id)).toContain(e);
  }, 20000);
});

describe("la cereza de fuera y el pedido", () => {
  it("sin peso declarado no hay comparación; con 100 declarados y neto 99,8, BALANCED", async () => {
    const base = { beneficioId: beneficio, recibidaAt: new Date(), recipientes: 0, taraPorRecipienteKg: 0 };
    const sin = await recibirCereza(receptor, { ...base, claveDeEnvio: randomUUID(), origen: { proveedorId: proveedor }, brutoKg: 50 });
    expect(sin.comparacion).toBeNull();
    const con = await recibirCereza(receptor, { ...base, claveDeEnvio: randomUUID(), origen: { proveedorId: proveedor, pesoDeclaradoKg: 100 }, brutoKg: 99.8 });
    expect(con.comparacion).toBe("BALANCED");
  }, 20000);

  it("pedido de 500 con 2 %: 300 y 220 — la segunda sin nota se rechaza, con nota entra", async () => {
    const pedido = await crearPedido(receptor, { beneficioId: beneficio, fuente: { fincaSiteId: finca }, fecha: hoy, kgPedidos: 500, margenCantidadPct: 2 });
    await recibir(receptor, await entrega(300), { pedidoId: pedido.id, brutoKg: 300, recipientes: 0, taraPorRecipienteKg: 0 });
    const e2 = await entrega(220);
    await expect(recibir(receptor, e2, { pedidoId: pedido.id, brutoKg: 220, recipientes: 0, taraPorRecipienteKg: 0 })).rejects.toThrow(/nota_obligatoria/);
    const r2 = await recibir(receptor, e2, { pedidoId: pedido.id, brutoKg: 220, recipientes: 0, taraPorRecipienteKg: 0, nota: "vino de más" });
    expect(r2.pedidoId).toBe(pedido.id);
  }, 20000);

  it("dos cierres a la vez del mismo pedido: uno entra, el otro ve «ya cerrado»", async () => {
    const p = await crearPedido(receptor, { beneficioId: beneficio, fuente: { proveedorId: proveedor }, fecha: hoy, kgPedidos: 100, margenCantidadPct: 100 });
    const res = await Promise.allSettled([cerrarPedido(receptor, { pedidoId: p.id }), cerrarPedido(receptor, { pedidoId: p.id })]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(res.filter((x) => x.status === "rejected").map((x) => String((x as PromiseRejectedResult).reason))).toEqual([expect.stringMatching(/ya_cerrado/)]);
  }, 20000);

  it("un pedido de otra fuente no se puede elegir", async () => {
    const ajeno = await crearPedido(receptor, { beneficioId: beneficio, fuente: { proveedorId: otroProveedor }, fecha: hoy, kgPedidos: 100, margenCantidadPct: 0 });
    await expect(recibir(receptor, await entrega(), { pedidoId: ajeno.id })).rejects.toThrow(/pedido_no_valido/);
  }, 20000);
});
