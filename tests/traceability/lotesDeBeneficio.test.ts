/**
 * Armar un lote con cereza de recepciones, y la genealogía que lleva de un lote lejano a las
 * recepciones de las que salió — spec de la recepción a los lotes §3.1 y §3.2, plan Tarea 4.
 *
 * Grupo `base-sembrada`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { borrarVinculosDeLote } from "../helpers/borrarVinculosDeLote";
import { abrirJornada, agregarRecolector } from "../../lib/traceability/jornadasDeCosecha";
import { anotarEntrega } from "../../lib/traceability/entregasDeCosecha";
import { recibirCereza } from "../../lib/traceability/recepcionesDeCereza";
import { armarLote, origenDelLote, recepcionesArmables } from "../../lib/traceability/lotesDeBeneficio";
import { recordTransformation } from "../../lib/traceability/lots";

const RUN = `lotes-${Date.now()}`;
const personas: string[] = [];
const cuentas: string[] = [];
const scopes: string[] = [];
const orgs: string[] = [];
const hoy = new Date(new Date().toISOString().slice(0, 10));

let orgFinca: string;
let finca: string;
let parcela: string;
let beneficio: string;
let otraFinca: string;
let otroBeneficio: string;
let jornada: string;
let jornadaAjena: string;
let recolector: string;
let capataz: string;
let receptor: string;
let managerOtra: string;
let operario: string;

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
async function org(n: string) {
  const o = await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${n} (${RUN})`, status: "approved", classification: "internal" } });
  orgs.push(o.id);
  return o.id;
}
const loc = async (n: string, tipo: "site" | "plot" | "beneficio", extra: Record<string, string>) =>
  (await prisma.location.create({ data: { name: `TEST ${n} (${RUN})`, locationType: tipo, classification: "internal", ...extra } })).id;

beforeAll(async () => {
  orgFinca = await org("Finca");
  finca = await loc("Finca", "site", { organizationId: orgFinca });
  parcela = await loc("Parcela", "plot", { parentLocationId: finca });
  beneficio = await loc("Beneficio", "beneficio", { parentLocationId: finca });
  otraFinca = await loc("Otra finca", "site", { organizationId: await org("Otra finca") });
  otroBeneficio = await loc("Otro beneficio", "beneficio", { parentLocationId: otraFinca });
  recolector = await persona("Recolector");
  await cuenta(recolector, "Recolector", finca);
  capataz = await cuenta(await persona("Capataz"), "Farm Operator", finca);
  receptor = await cuenta(await persona("Receptor"), "Farm Operator", finca);
  operario = await cuenta(await persona("Operario"), "Farm Manager", finca);
  managerOtra = await cuenta(await persona("Manager otra"), "Farm Manager", otraFinca);
  await agregarRecolector(capataz, { fincaSiteId: finca, personId: recolector, desde: new Date(hoy.getTime() - 86_400_000) });
  jornada = (await abrirJornada(capataz, { fincaSiteId: finca, beneficioId: beneficio, fecha: hoy, asignaciones: [{ locationId: parcela, personId: recolector }] })).id;
  jornadaAjena = (
    await prisma.jornadaDeCosecha.create({
      data: { fincaSiteId: finca, beneficioId: otroBeneficio, fecha: hoy, asignaciones: { create: [{ locationId: parcela, personId: recolector }] } },
    })
  ).id;
}, 30000);

afterAll(async () => {
  const jornadas = (await prisma.jornadaDeCosecha.findMany({ where: { fincaSiteId: finca }, select: { id: true } })).map((j) => j.id);
  const entregas = (await prisma.entregaDeCosecha.findMany({ where: { jornadaId: { in: jornadas } }, select: { id: true } })).map((e) => e.id);
  const recepciones = (await prisma.recepcionDeCereza.findMany({ where: { beneficioId: { in: [beneficio, otroBeneficio] } }, select: { id: true } })).map((r) => r.id);
  const lotes = (await prisma.lot.findMany({ where: { lotCode: { startsWith: `TEST-${RUN}` } }, select: { id: true } })).map((l) => l.id);
  const transformaciones = (
    await prisma.lotTransformation.findMany({ where: { OR: [{ inputs: { some: { lotId: { in: lotes } } } }, { outputs: { some: { lotId: { in: lotes } } } }] }, select: { id: true } })
  ).map((t) => t.id);
  const recolectores = (await prisma.fincaRecolector.findMany({ where: { fincaSiteId: finca }, select: { id: true } })).map((r) => r.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...jornadas, ...entregas, ...recepciones, ...lotes, ...transformaciones, ...recolectores] } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformaciones } }) });
  await borrarVinculosDeLote(recepciones);
  await prisma.recepcionDeCereza.deleteMany({ where: assertDefinedWhere({ id: { in: recepciones } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.entregaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: entregas } }) });
  await prisma.jornadaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: jornadas } }) });
  await prisma.fincaRecolector.deleteMany({ where: assertDefinedWhere({ id: { in: recolectores } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [parcela, beneficio, otroBeneficio] } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [finca, otraFinca] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgs } }) });
}, 30000);

/** Una recepción de `kg` netos en `destino`: bruto = kg + 1, con 2 recipientes de 0,5. */
async function recepcion(kg: number, destino = beneficio, jornadaId = jornada) {
  const entregaId =
    jornadaId === jornada
      ? (await anotarEntrega(capataz, { jornadaId, recolectorPersonId: recolector, origen: { locationId: parcela }, pesoFincaKg: kg, enviadaAt: new Date() })).id
      : (
          await prisma.entregaDeCosecha.create({
            data: { jornadaId, recolectorId: recolector, locationId: parcela, pesoFincaKg: kg, enviadaAt: new Date(), anotadaPor: capataz },
          })
        ).id;
  return recibirCereza(destino === beneficio ? receptor : managerOtra, {
    claveDeEnvio: randomUUID(), beneficioId: destino, origen: { entregaId }, recibidaAt: new Date(),
    brutoKg: kg + 1, recipientes: 2, taraPorRecipienteKg: 0.5,
  });
}

let n = 0;
const codigo = () => `TEST-${RUN}-${++n}`;

describe("armar un lote", () => {
  it("dos recepciones de 20 y 30 dan un lote de 50, SIN proceso abierto y con su QuantityEvent", async () => {
    const a = await recepcion(20);
    const b = await recepcion(30);
    const lote = await armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: a.id, kg: 20 }, { recepcionId: b.id, kg: 30 }] });
    expect(lote.lotType).toBe("cherry");
    expect(lote.locationId).toBe(beneficio);
    const cantidad = await prisma.quantityEvent.findFirstOrThrow({ where: { lotId: lote.id, eventType: "received" } });
    expect(Number(cantidad.quantity)).toBe(50);
    expect(await prisma.lotProcess.count({ where: { lotId: lote.id } })).toBe(0);
    expect(await prisma.auditEvent.findFirst({ where: { entityId: lote.id, operation: "lot.assembled_from_receptions" } })).not.toBeNull();
    expect((await origenDelLote(lote.id)).map((o) => o.recepcionId).sort()).toEqual([a.id, b.id].sort());
  }, 30000);

  it("tomar 10 de una de 20 deja 10 disponibles, y pedir 11 más se rechaza", async () => {
    const a = await recepcion(20);
    await armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: a.id, kg: 10 }] });
    const armables = await recepcionesArmables(operario, beneficio);
    expect(armables.find((f) => f.recepcion.id === a.id)?.disponibleKg).toBe(10);
    await expect(armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: a.id, kg: 11 }] })).rejects.toThrow(/kg_sobre_lo_recibido/);
    // Control positivo: los 10 que quedan SÍ entran, así que el rechazo es por el kilo de más.
    await armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: a.id, kg: 10 }] });
    expect((await recepcionesArmables(operario, beneficio)).find((f) => f.recepcion.id === a.id)).toBeUndefined();
  }, 30000);

  it("dos armados simultáneos de 15 sobre la misma recepción de 20: entra uno solo", async () => {
    const a = await recepcion(20);
    const r = await Promise.allSettled([
      armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: a.id, kg: 15 }] }),
      armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: a.id, kg: 15 }] }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.loteDesdeRecepcion.count({ where: { recepcionId: a.id } })).toBe(1);
  }, 30000);

  it("una recepción de OTRO beneficio no entra aquí", async () => {
    const ajena = await recepcion(20, otroBeneficio, jornadaAjena);
    await expect(armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: ajena.id, kg: 5 }] })).rejects.toThrow(
      /recepcion_de_otro_beneficio/,
    );
  }, 30000);

  it("un Farm Manager de otra finca no arma aquí; y sin recepciones, ni con kg 0, se arma", async () => {
    const a = await recepcion(20);
    await expect(armarLote(managerOtra, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: a.id, kg: 5 }] })).rejects.toThrow();
    await expect(armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [] })).rejects.toThrow(/sin_recepciones/);
    await expect(armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: a.id, kg: 0 }] })).rejects.toThrow(/kg_invalidos/);
  }, 30000);
});

describe("la genealogía", () => {
  it("A sale de R, A se divide en B y C, B y C se fusionan en D: origenDelLote(D) devuelve R UNA vez", async () => {
    const r = await recepcion(40);
    const a = await armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: r.id, kg: 40 }] });
    // Control: el lote de nivel 1 ya dice de dónde viene.
    expect(await origenDelLote(a.id)).toEqual([{ recepcionId: r.id, kg: 40, nivel1LotId: a.id }]);

    const division = await recordTransformation(operario, {
      transformationType: "split", occurredAt: new Date(), provenanceClass: "direct_observation",
      inputs: [{ lotId: a.id, quantity: 40, unit: "kg" }],
      outputs: [
        { lotCode: codigo(), lotType: "cherry", quantity: 20, unit: "kg" },
        { lotCode: codigo(), lotType: "cherry", quantity: 20, unit: "kg" },
      ],
    });
    const [b, c] = division.outputLots;
    if (!b || !c) throw new Error("la división tiene que dar dos lotes");
    const fusion = await recordTransformation(operario, {
      transformationType: "merge", occurredAt: new Date(), provenanceClass: "direct_observation",
      inputs: [{ lotId: b.id, quantity: 20, unit: "kg" }, { lotId: c.id, quantity: 20, unit: "kg" }],
      outputs: [{ lotCode: codigo(), lotType: "cherry", quantity: 40, unit: "kg" }],
    });
    const d = fusion.outputLots[0];
    if (!d) throw new Error("la fusión tiene que dar un lote");

    const origen = await origenDelLote(d.id);
    expect(origen).toEqual([{ recepcionId: r.id, kg: 40, nivel1LotId: a.id }]);
  }, 40000);
});
