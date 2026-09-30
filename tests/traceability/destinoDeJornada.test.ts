/**
 * El beneficio de destino de una jornada, y la entrega recibida que ya no se anula.
 *
 * Spec: docs/superpowers/specs/2026-09-19-recepcion-de-cereza-en-beneficio-design.md §3.1 y §3.4.
 * Plan: Tarea 3. Grupo `base-sembrada`.
 *
 * Las recepciones de estas pruebas se crean directamente en la base: el servicio de recepción es la
 * Tarea 5, y aquí lo que se prueba es el servicio de la jornada y de la entrega frente a una.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { abrirJornada, agregarRecolector, beneficiosDeDestino, cambiarDestinoDeJornada, JornadaError } from "../../lib/traceability/jornadasDeCosecha";
import { declararDestinoDeFinca } from "../../lib/traceability/destinoDeFinca";
import { anotarEntrega, anularEntrega } from "../../lib/traceability/entregasDeCosecha";

const RUN = `dest-${Date.now()}`;
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
let beneficioAjeno: string;
let manager: string;
let receptor: string;
let recolector: string;

async function persona(n: string) {
  const id = randomUUID();
  await prisma.person.create({ data: { id, givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN})` } });
  personas.push(id);
  return id;
}
async function cuenta(perfil: string, siteId: string) {
  const id = randomUUID();
  await prisma.userAccount.create({ data: { id, personId: await persona(perfil), status: "active", authProvider: "credentials" } });
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
const bajo = async (padre: string, n: string, tipo: "plot" | "beneficio") =>
  (await prisma.location.create({ data: { name: `TEST ${n} (${RUN})`, locationType: tipo, parentLocationId: padre, classification: "internal" } })).id;

beforeAll(async () => {
  finca = await sitio("Finca");
  parcela = await bajo(finca, "Parcela", "plot");
  beneficio = await bajo(finca, "Beneficio", "beneficio");
  beneficio2 = await bajo(finca, "Beneficio 2", "beneficio");
  otraFinca = await sitio("Otra finca");
  beneficioAjeno = await bajo(otraFinca, "Beneficio ajeno", "beneficio");
  manager = await cuenta("Farm Manager", finca);
  receptor = await cuenta("Farm Operator", finca);
  recolector = await persona("Recolector");
  const { organizationId } = await prisma.location.findUniqueOrThrow({ where: { id: finca }, select: { organizationId: true } });
  await prisma.organizationMembership.create({ data: { personId: recolector, organizationId: organizationId! } });
  await agregarRecolector(manager, { fincaSiteId: finca, personId: recolector, desde: new Date(hoy.getTime() - 86_400_000) });
}, 30000);

afterAll(async () => {
  const jornadas = (await prisma.jornadaDeCosecha.findMany({ where: { fincaSiteId: finca }, select: { id: true } })).map((j) => j.id);
  const entregas = (await prisma.entregaDeCosecha.findMany({ where: { jornadaId: { in: jornadas } }, select: { id: true } })).map((e) => e.id);
  const recolectores = (await prisma.fincaRecolector.findMany({ where: { fincaSiteId: finca }, select: { id: true } })).map((r) => r.id);
  await prisma.recepcionDeCereza.deleteMany({ where: assertDefinedWhere({ entregaId: { in: entregas } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...jornadas, ...entregas, ...recolectores] } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.entregaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: entregas } }) });
  await prisma.jornadaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: jornadas } }) });
  await prisma.fincaRecolector.deleteMany({ where: assertDefinedWhere({ id: { in: recolectores } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.organizationMembership.deleteMany({ where: assertDefinedWhere({ personId: { in: personas } }) });
  // La FK del destino es RESTRICT: sin soltarlo, borrar el beneficio lanza y —siendo el
  // `afterAll` una cadena— abandona los borrados de abajo.
  await prisma.location.updateMany({ where: assertDefinedWhere({ beneficioDestinoId: { in: [beneficio, beneficio2, beneficioAjeno] } }), data: { beneficioDestinoId: null } });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [parcela, beneficio, beneficio2, beneficioAjeno] } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [finca, otraFinca] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgs } }) });
}, 30000);

/** El destino ya no se pasa: se declara en la finca y la jornada lo COPIA al abrirse (ADR-194). */
const abrir = async (beneficioId: string) => {
  await prisma.location.update({ where: { id: finca }, data: { beneficioDestinoId: beneficioId } });
  return abrirJornada(manager, { fincaSiteId: finca, fecha: hoy, asignaciones: [{ locationId: parcela, personId: recolector }] });
};

/** Una recepción vigente de la entrega, escrita directo en la base (el servicio es la Tarea 5). */
async function recibir(entregaId: string) {
  return prisma.recepcionDeCereza.create({
    data: {
      claveDeEnvio: randomUUID(), beneficioId: beneficio, entregaId, recibidaPor: receptor, recibidaAt: new Date(),
      brutoKg: 20, recipientes: 0, taraPorRecipienteKg: 0, netoKg: 20, referenciaKg: 20, diferenciaKg: 0, toleranciaKg: 0.5,
      comparacion: "BALANCED", politicaDeBalance: { relativeTolerance: 0.005, absoluteFloorKg: 0.5, grossThreshold: 0.05 },
    },
  });
}

/**
 * `cambiarDestinoDeJornada` ES la corrección (ADR-194 + diseño 2026-09-30 §4.3). Antes de este
 * cambio ninguna jornada podía nacer sin destino, así que «poner uno donde no había» era un caso
 * que no existía; ahora una finca sin destino declarado abre jornadas con `beneficioId` en `null`,
 * y esto es lo único que las rescata.
 */
describe("corregir el destino de una jornada que nació sin él", () => {
  it("corrige una jornada que nació sin destino", async () => {
    await prisma.location.update({ where: { id: finca }, data: { beneficioDestinoId: null } });
    const j = await abrirJornada(manager, { fincaSiteId: finca, fecha: hoy, asignaciones: [{ locationId: parcela, personId: recolector }] });
    expect(j.beneficioId).toBeNull(); // control: de verdad nació sin destino

    await cambiarDestinoDeJornada(manager, { jornadaId: j.id, beneficioId: beneficio });
    expect((await prisma.jornadaDeCosecha.findUniqueOrThrow({ where: { id: j.id } })).beneficioId).toBe(beneficio);
  }, 20000);
});

describe("el destino al abrir la jornada", () => {
  /**
   * **Estas dos comprobaciones no se han perdido: se han MOVIDO** (ADR-194, 2026-09-30). Antes las
   * hacía `abrirJornada`, porque el destino se le pasaba; ahora el destino lo lleva la finca, así
   * que quien las tiene que hacer es `declararDestinoDeFinca` — y la jornada se limita a copiar lo
   * que encuentre. Se reescriben en su sitio nuevo en vez de borrarse: un guardia que se quita
   * porque falló es cobertura que desaparece sin que nadie lo note.
   */
  it("sin destino, o con algo que no es un beneficio, se rechaza al DECLARARLO; con el beneficio, la jornada lo copia", async () => {
    await expect(declararDestinoDeFinca(manager, { fincaSiteId: finca, beneficioId: "" })).rejects.toThrow(/beneficio_no_valido/);
    await expect(declararDestinoDeFinca(manager, { fincaSiteId: finca, beneficioId: parcela })).rejects.toThrow(/beneficio_no_valido/);
    await declararDestinoDeFinca(manager, { fincaSiteId: finca, beneficioId: beneficio });
    const j = await abrirJornada(manager, { fincaSiteId: finca, fecha: hoy, asignaciones: [{ locationId: parcela, personId: recolector }] });
    expect(j.beneficioId).toBe(beneficio);
  }, 20000);

  it("un beneficio de otra finca, que no ve, se rechaza al declararlo", async () => {
    await expect(declararDestinoDeFinca(manager, { fincaSiteId: finca, beneficioId: beneficioAjeno })).rejects.toThrow(/beneficio_no_valido/);
  }, 20000);

  it("los destinos que se le ofrecen son los de su finca, no los de otra", async () => {
    const ids = (await beneficiosDeDestino(manager)).map((b) => b.id);
    expect(ids).toContain(beneficio);
    expect(ids).toContain(beneficio2);
    expect(ids).not.toContain(beneficioAjeno);
  }, 20000);
});

describe("cambiar el destino", () => {
  it("sin recepciones cambia, con su AuditEvent; con una recepción vigente, queda fijo", async () => {
    const j = await abrir(beneficio);
    const cambiada = await cambiarDestinoDeJornada(manager, { jornadaId: j.id, beneficioId: beneficio2 });
    expect(cambiada.beneficioId).toBe(beneficio2);
    expect(await prisma.auditEvent.findFirst({ where: { entityId: j.id, operation: "harvest_day.set_destination" } })).not.toBeNull();
    await cambiarDestinoDeJornada(manager, { jornadaId: j.id, beneficioId: beneficio });
    const e = await anotarEntrega(manager, { jornadaId: j.id, recolectorPersonId: recolector, origen: { locationId: parcela }, pesoFincaKg: 20, enviadaAt: new Date() });
    await recibir(e.id);
    // **`JornadaError` y no sólo el mensaje.** Con `/destino_fijo/` a secas esta aserción no
    // distinguía el cinturón de los tirantes: quitando la guarda del SERVICIO, el disparador
    // `jornada_de_cosecha_destino_fijo` de la base salta igual y su excepción también contiene
    // «destino_fijo», así que la prueba seguía verde sobre código sin guarda. Lo destapó el
    // flip-test de la Tarea 4 (2026-09-30). Exigir la clase fija la capa donde tiene que pararse
    // —antes de escribir—, y la red de la base sigue debajo para lo que llegue por otro camino.
    await expect(cambiarDestinoDeJornada(manager, { jornadaId: j.id, beneficioId: beneficio2 })).rejects.toThrow(JornadaError);
    await expect(cambiarDestinoDeJornada(manager, { jornadaId: j.id, beneficioId: beneficio2 })).rejects.toThrow(/destino_fijo/);
  }, 20000);
});

describe("la entrega recibida no se anula desde la finca", () => {
  it("con una recepción vigente, ya_recibida; sin ella, se anula como antes", async () => {
    const j = await abrir(beneficio);
    const recibida = await anotarEntrega(manager, { jornadaId: j.id, recolectorPersonId: recolector, origen: { locationId: parcela }, pesoFincaKg: 20, enviadaAt: new Date() });
    await recibir(recibida.id);
    await expect(anularEntrega(manager, { entregaId: recibida.id, motivo: "error" })).rejects.toThrow(/ya_recibida/);
    const libre = await anotarEntrega(manager, { jornadaId: j.id, recolectorPersonId: recolector, origen: { locationId: parcela }, pesoFincaKg: 20, enviadaAt: new Date() });
    const anulada = await anularEntrega(manager, { entregaId: libre.id, motivo: "pesada dos veces" });
    expect(anulada.estado).toBe("anulada");
  }, 20000);
});
