/**
 * La entrega de cosecha — spec 2026-09-18 jornada y entrega §3.3–3.4. Plan, Tarea 3.
 *
 * Grupo `base-sembrada`: necesita los perfiles del catálogo sembrados (Recolector, Farm Operator).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { abrirJornada, agregarRecolector, cerrarJornada } from "../../lib/traceability/jornadasDeCosecha";
import { anotarEntrega, anularEntrega, misEntregas } from "../../lib/traceability/entregasDeCosecha";

const RUN = `ent-${Date.now()}`;
const personas: string[] = [];
const cuentas: string[] = [];
const scopes: string[] = [];
const hoy = new Date(new Date().toISOString().slice(0, 10));

let orgId: string;
let finca: string;
let beneficio: string;
let parcela: string;
let otraParcela: string;
let bloque: string;
let capataz: string;
let cuentaR1: string;
let r1: string;
let r2: string;
let jornada: string;

async function persona(n: string) {
  const id = randomUUID();
  await prisma.person.create({ data: { id, givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN})` } });
  personas.push(id);
  return id;
}
async function cuenta(personId: string, perfil: string) {
  const id = randomUUID();
  await prisma.userAccount.create({ data: { id, personId, status: "active", authProvider: "credentials" } });
  cuentas.push(id);
  const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: finca } });
  const s = existente ?? (await prisma.scope.create({ data: { id: randomUUID(), scopeType: "location", scopeRefId: finca } }));
  if (!existente) scopes.push(s.id);
  await prisma.assignment.create({ data: { userAccountId: id, scopeId: s.id, roleProfileId: rp.id } });
  return id;
}

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Finca (${RUN})`, status: "approved", classification: "internal" } })).id;
  finca = (await prisma.location.create({ data: { name: `TEST Finca (${RUN})`, locationType: "site", organizationId: orgId, classification: "internal" } })).id;
  beneficio = (await prisma.location.create({ data: { name: `TEST Beneficio (${RUN})`, locationType: "beneficio", parentLocationId: finca, classification: "internal" } })).id;
  parcela = (await prisma.location.create({ data: { name: `TEST P (${RUN})`, locationType: "plot", parentLocationId: finca, classification: "internal" } })).id;
  otraParcela = (await prisma.location.create({ data: { name: `TEST Q (${RUN})`, locationType: "plot", parentLocationId: finca, classification: "internal" } })).id;
  bloque = (await prisma.plotBlock.create({ data: { locationId: parcela, name: `TEST Bloque (${RUN})` } })).id;
  capataz = await cuenta(await persona("Capataz"), "Farm Operator");
  r1 = await persona("Recolector 1");
  cuentaR1 = await cuenta(r1, "Recolector");
  r2 = await persona("Recolector 2 sin cuenta");
  await prisma.organizationMembership.createMany({ data: [r1, r2].map((personId) => ({ personId, organizationId: orgId })) });
  const ayer = new Date(hoy.getTime() - 86_400_000);
  await agregarRecolector(capataz, { fincaSiteId: finca, personId: r1, desde: ayer });
  await agregarRecolector(capataz, { fincaSiteId: finca, personId: r2, desde: ayer });
  // El destino ya no se pasa a `abrirJornada`: lo lleva la finca y la jornada lo COPIA (ADR-194).
  await prisma.location.update({ where: { id: finca }, data: { beneficioDestinoId: beneficio } });
  jornada = (
    await abrirJornada(capataz, {
      fincaSiteId: finca,
      fecha: hoy,
      asignaciones: [
        { locationId: parcela, personId: r1 },
        { locationId: parcela, personId: r2 },
      ],
    })
  ).id;
}, 30000);

afterAll(async () => {
  const jornadas = (await prisma.jornadaDeCosecha.findMany({ where: { fincaSiteId: finca }, select: { id: true } })).map((j) => j.id);
  const entregas = (await prisma.entregaDeCosecha.findMany({ where: { jornadaId: { in: jornadas } }, select: { id: true } })).map((e) => e.id);
  const recolectores = (await prisma.fincaRecolector.findMany({ where: { fincaSiteId: finca }, select: { id: true } })).map((r) => r.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...jornadas, ...entregas, ...recolectores] } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.entregaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: entregas } }) });
  await prisma.jornadaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: jornadas } }) });
  await prisma.fincaRecolector.deleteMany({ where: assertDefinedWhere({ id: { in: recolectores } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.organizationMembership.deleteMany({ where: assertDefinedWhere({ personId: { in: personas } }) });
  await prisma.plotBlock.deleteMany({ where: assertDefinedWhere({ id: bloque }) });
  // La FK del destino es RESTRICT: sin soltarlo, borrar el beneficio lanza y —siendo el
  // `afterAll` una cadena— abandona los borrados de abajo.
  await prisma.location.updateMany({ where: assertDefinedWhere({ beneficioDestinoId: beneficio }), data: { beneficioDestinoId: null } });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [beneficio, parcela, otraParcela] } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: finca }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
}, 30000);

const base = () => ({ jornadaId: jornada, pesoFincaKg: 18.5, enviadaAt: new Date() });

describe("anotar la entrega", () => {
  it("el capataz anota la de un recolector sin cuenta, con su AuditEvent y anotadaPor", async () => {
    const e = await anotarEntrega(capataz, { ...base(), recolectorPersonId: r2, origen: { locationId: parcela } });
    expect(e.recolectorId).toBe(r2);
    expect(e.anotadaPor).toBe(capataz);
    expect(e.estado).toBe("enviada");
    expect(await prisma.auditEvent.findFirst({ where: { entityId: e.id, operation: "harvest_delivery.create" } })).not.toBeNull();
  }, 20000);

  it("el recolector con cuenta anota la suya, desde un bloque de su parcela", async () => {
    const e = await anotarEntrega(cuentaR1, { ...base(), recolectorPersonId: r1, origen: { plotBlockId: bloque } });
    expect(e.plotBlockId).toBe(bloque);
    expect(e.anotadaPor).toBe(cuentaR1);
  }, 20000);

  it("el recolector NO anota la de otro", async () => {
    await expect(anotarEntrega(cuentaR1, { ...base(), recolectorPersonId: r2, origen: { locationId: parcela } })).rejects.toThrow(/no_es_su_entrega/);
  }, 20000);

  it("un origen fuera de lo asignado se rechaza", async () => {
    await expect(anotarEntrega(capataz, { ...base(), recolectorPersonId: r1, origen: { locationId: otraParcela } })).rejects.toThrow(/origen_no_asignado/);
  }, 20000);

  it("ninguna entrega crea un lote", async () => {
    const antes = await prisma.lot.count({ where: { createdBy: { in: cuentas } } });
    await anotarEntrega(capataz, { ...base(), recolectorPersonId: r1, origen: { locationId: parcela } });
    expect(await prisma.lot.count({ where: { createdBy: { in: cuentas } } })).toBe(antes);
    expect(antes).toBe(0);
  }, 20000);

  it("en una jornada cerrada no se anota", async () => {
    const otra = await abrirJornada(capataz, { fincaSiteId: finca, fecha: hoy, asignaciones: [{ locationId: parcela, personId: r1 }] });
    await cerrarJornada(capataz, otra.id);
    await expect(anotarEntrega(capataz, { ...base(), jornadaId: otra.id, recolectorPersonId: r1, origen: { locationId: parcela } })).rejects.toThrow(
      /jornada_cerrada/,
    );
  }, 20000);
});

describe("anular y ver", () => {
  it("anular exige motivo; con motivo queda anulada; el recolector no anula", async () => {
    const e = await anotarEntrega(capataz, { ...base(), recolectorPersonId: r1, origen: { locationId: parcela } });
    await expect(anularEntrega(capataz, { entregaId: e.id, motivo: "  " })).rejects.toThrow(/motivo_obligatorio/);
    await expect(anularEntrega(cuentaR1, { entregaId: e.id, motivo: "me equivoqué" })).rejects.toThrow();
    const anulada = await anularEntrega(capataz, { entregaId: e.id, motivo: "pesada dos veces" });
    expect(anulada.estado).toBe("anulada");
    expect(anulada.motivoAnulacion).toBe("pesada dos veces");
  }, 20000);

  it("«mis entregas» sólo trae las del recolector de la cuenta", async () => {
    const mias = await misEntregas(cuentaR1);
    expect(mias.personaId).toBe(r1);
    expect(mias.entregas.length).toBeGreaterThan(0);
    expect(mias.entregas.every((e) => e.recolectorId === r1)).toBe(true);
    expect(mias.asignaciones.some((a) => a.jornada.id === jornada)).toBe(true);
  }, 20000);
});
