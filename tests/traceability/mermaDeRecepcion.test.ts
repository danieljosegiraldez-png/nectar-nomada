/**
 * La merma de una recepción y lo que queda disponible — spec de la recepción a los lotes §3.3,
 * plan Tarea 3.
 *
 * La merma es cereza que se recibió y no va a llegar a ningún lote: se cayó, se pudrió, se pesó de
 * más. No es un lote, así que no tiene genealogía; por eso vive en su propia tabla y baja el
 * disponible igual que un vínculo. Grupo `base-sembrada`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { borrarVinculosDeLote } from "../helpers/borrarVinculosDeLote";
import { abrirJornada, agregarRecolector } from "../../lib/traceability/jornadasDeCosecha";
import { anotarEntrega } from "../../lib/traceability/entregasDeCosecha";
import {
  anotarMerma,
  anularMerma,
  anularRecepcion,
  disponibleDeRecepciones,
  recibirCereza,
} from "../../lib/traceability/recepcionesDeCereza";

const RUN = `merma-${Date.now()}`;
const personas: string[] = [];
const cuentas: string[] = [];
const scopes: string[] = [];
const orgs: string[] = [];
const lotes: string[] = [];
const hoy = new Date(new Date().toISOString().slice(0, 10));

let finca: string;
let parcela: string;
let beneficio: string;
let otraFinca: string;
let jornada: string;
let recolector: string;
let capataz: string;
let receptor: string;
let managerOtra: string;

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

let orgFinca: string;

beforeAll(async () => {
  orgFinca = await org("Finca");
  finca = await loc("Finca", "site", { organizationId: orgFinca });
  parcela = await loc("Parcela", "plot", { parentLocationId: finca });
  beneficio = await loc("Beneficio", "beneficio", { parentLocationId: finca });
  otraFinca = await loc("Otra finca", "site", { organizationId: await org("Otra finca") });
  recolector = await persona("Recolector");
  await cuenta(recolector, "Recolector", finca);
  capataz = await cuenta(await persona("Capataz"), "Farm Operator", finca);
  receptor = await cuenta(await persona("Receptor"), "Farm Operator", finca);
  managerOtra = await cuenta(await persona("Manager otra"), "Farm Manager", otraFinca);
  await agregarRecolector(capataz, { fincaSiteId: finca, personId: recolector, desde: new Date(hoy.getTime() - 86_400_000) });
  jornada = (await abrirJornada(capataz, { fincaSiteId: finca, beneficioId: beneficio, fecha: hoy, asignaciones: [{ locationId: parcela, personId: recolector }] })).id;
}, 30000);

afterAll(async () => {
  const jornadas = (await prisma.jornadaDeCosecha.findMany({ where: { fincaSiteId: finca }, select: { id: true } })).map((j) => j.id);
  const entregas = (await prisma.entregaDeCosecha.findMany({ where: { jornadaId: { in: jornadas } }, select: { id: true } })).map((e) => e.id);
  const recepciones = (await prisma.recepcionDeCereza.findMany({ where: { beneficioId: beneficio }, select: { id: true } })).map((r) => r.id);
  const mermas = (await prisma.mermaDeRecepcion.findMany({ where: { recepcionId: { in: recepciones } }, select: { id: true } })).map((m) => m.id);
  const recolectores = (await prisma.fincaRecolector.findMany({ where: { fincaSiteId: finca }, select: { id: true } })).map((r) => r.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...jornadas, ...entregas, ...recepciones, ...mermas, ...recolectores, ...lotes] } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await borrarVinculosDeLote(recepciones);
  await prisma.mermaDeRecepcion.deleteMany({ where: assertDefinedWhere({ id: { in: mermas } }) });
  await prisma.recepcionDeCereza.deleteMany({ where: assertDefinedWhere({ id: { in: recepciones } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.entregaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: entregas } }) });
  await prisma.jornadaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: jornadas } }) });
  await prisma.fincaRecolector.deleteMany({ where: assertDefinedWhere({ id: { in: recolectores } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [parcela, beneficio] } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [finca, otraFinca] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgs } }) });
}, 30000);

/** Una recepción de 100 kg netos: bruto 101 con 2 recipientes de 0,5. */
async function recepcionDe100() {
  const entregaId = (
    await anotarEntrega(capataz, { jornadaId: jornada, recolectorPersonId: recolector, origen: { locationId: parcela }, pesoFincaKg: 100, enviadaAt: new Date() })
  ).id;
  return recibirCereza(receptor, {
    claveDeEnvio: randomUUID(), beneficioId: beneficio, origen: { entregaId }, recibidaAt: new Date(),
    brutoKg: 101, recipientes: 2, taraPorRecipienteKg: 0.5,
  });
}

const disponible = async (id: string) => (await disponibleDeRecepciones([id])).get(id);

describe("la merma", () => {
  it("una recepción de 100 con merma de 3 tiene 97 disponibles", async () => {
    const r = await recepcionDe100();
    expect(await disponible(r.id)).toBe(100);
    const m = await anotarMerma(receptor, { recepcionId: r.id, kg: 3, motivo: "se regó un saco", anotadaAt: new Date() });
    expect(Number(m.kg)).toBe(3);
    expect(await disponible(r.id)).toBe(97);
    expect(await prisma.auditEvent.findFirst({ where: { entityId: m.id, operation: "cherry_reception.loss" } })).not.toBeNull();
  }, 20000);

  it("una merma de 200 se rechaza; una de 0, también; y una sin motivo", async () => {
    const r = await recepcionDe100();
    await expect(anotarMerma(receptor, { recepcionId: r.id, kg: 200, motivo: "todo", anotadaAt: new Date() })).rejects.toThrow(/merma_sobre_lo_disponible/);
    await expect(anotarMerma(receptor, { recepcionId: r.id, kg: 0, motivo: "nada", anotadaAt: new Date() })).rejects.toThrow(/kg_invalidos/);
    await expect(anotarMerma(receptor, { recepcionId: r.id, kg: 2, motivo: "  ", anotadaAt: new Date() })).rejects.toThrow(/motivo_obligatorio/);
    expect(await disponible(r.id)).toBe(100);
  }, 20000);

  it("anulada la merma, vuelven los 100, y no se anula dos veces", async () => {
    const r = await recepcionDe100();
    const m = await anotarMerma(receptor, { recepcionId: r.id, kg: 40, motivo: "mal pesada", anotadaAt: new Date() });
    expect(await disponible(r.id)).toBe(60);
    const anulada = await anularMerma(receptor, { mermaId: m.id, motivo: "era de otra recepción" });
    expect(anulada.estado).toBe("anulada");
    expect(await disponible(r.id)).toBe(100);
    await expect(anularMerma(receptor, { mermaId: m.id, motivo: "otra vez" })).rejects.toThrow(/ya_anulada/);
  }, 20000);

  it("anular una recepción con un lote encima se rechaza: ya_tiene_lotes", async () => {
    const r = await recepcionDe100();
    const lot = await prisma.lot.create({ data: { lotCode: `TEST-MERMA-${RUN}`, lotType: "cherry", organizationId: orgFinca, locationId: beneficio } });
    lotes.push(lot.id);
    await prisma.loteDesdeRecepcion.create({ data: { lotId: lot.id, recepcionId: r.id, kg: 10 } });
    expect(await disponible(r.id)).toBe(90);
    await expect(anularRecepcion(receptor, { recepcionId: r.id, motivo: "me equivoqué" })).rejects.toThrow(/ya_tiene_lotes/);
    // Control positivo: una recepción SIN lotes sí se anula, así que el rechazo es por los lotes.
    const otra = await recepcionDe100();
    expect((await anularRecepcion(receptor, { recepcionId: otra.id, motivo: "me equivoqué" })).estado).toBe("anulada");
  }, 20000);

  it("un Farm Manager de otra finca no anota mermas aquí", async () => {
    const r = await recepcionDe100();
    await expect(anotarMerma(managerOtra, { recepcionId: r.id, kg: 1, motivo: "ajena", anotadaAt: new Date() })).rejects.toThrow();
    expect(await disponible(r.id)).toBe(100);
  }, 20000);
});
