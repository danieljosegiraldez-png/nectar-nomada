/**
 * Fincas y parcelas: elegir la finca, y crear fincas, parcelas y microparcelas.
 *
 * Spec: docs/superpowers/specs/2026-09-18-fincas-y-parcelas-design.md.
 * Plan: docs/superpowers/plans/2026-09-18-fincas-y-parcelas.md.
 *
 * Grupo `base-sembrada`: necesita los perfiles del catálogo sembrados.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { TODAS, idsBajoLaFinca, listarFincas, resolverFinca, type Finca } from "../../lib/traceability/fincas";

const RUN = `fin-${Date.now()}`;
const personas: string[] = [];
const cuentas: string[] = [];
const scopes: string[] = [];
const organizaciones: string[] = [];
const ubicaciones: string[] = [];

let admin: string;
let managerA: string;
let operarioA: string;
let A: { org: string; site: string };
let B: { org: string; site: string };
let C: { org: string; site: string };
let P1: string;
let M1: string;
let Q1: string;

async function cuenta(perfil: string, scope: { scopeType: "location" | "platform"; scopeRefId: string | null }) {
  const personId = randomUUID();
  await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: perfil, displayName: `TEST ${perfil} (${RUN})` } });
  personas.push(personId);
  const id = randomUUID();
  await prisma.userAccount.create({ data: { id, personId, status: "active", authProvider: "credentials" } });
  cuentas.push(id);
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: scope.scopeType, scopeRefId: scope.scopeRefId } });
  const s = existente ?? (await prisma.scope.create({ data: { id: randomUUID(), ...scope } }));
  if (!existente) scopes.push(s.id);
  await prisma.assignment.create({ data: { userAccountId: id, scopeId: s.id, roleProfileId: roleProfile.id } });
  return id;
}

async function finca(letra: string) {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Finca ${letra} (${RUN})`, status: "approved", classification: "internal" },
  });
  organizaciones.push(org.id);
  const site = await prisma.location.create({
    data: { name: `TEST Finca ${letra} (${RUN})`, locationType: "site", organizationId: org.id, classification: "internal" },
  });
  ubicaciones.push(site.id);
  return { org: org.id, site: site.id };
}

async function plot(nombre: string, parentLocationId: string, extra: Record<string, unknown> = {}) {
  const p = await prisma.location.create({
    data: { name: `${nombre} (${RUN})`, locationType: "plot", parentLocationId, classification: "internal", ...extra },
  });
  ubicaciones.push(p.id);
  return p.id;
}

beforeAll(async () => {
  A = await finca("A");
  B = await finca("B");
  C = await finca("C");
  P1 = await plot("P1", A.site);
  M1 = await plot("M1", P1, { subdivisionReason: "shade" });
  Q1 = await plot("Q1", B.site);
  admin = await cuenta("Platform Admin", { scopeType: "platform", scopeRefId: null });
  managerA = await cuenta("Farm Manager", { scopeType: "location", scopeRefId: A.site });
  // Dos fincas, A y C, y no B: con UNA sola, `resolverFinca` la elige sin mirar la cookie, y la
  // prueba de la cookie ajena no ejercería nada (lo destapó el flip-test del 2026-09-18).
  const fm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
  const scopeC = (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: C.site } }))
    ?? (await prisma.scope.create({ data: { id: randomUUID(), scopeType: "location", scopeRefId: C.site } }));
  if (!scopes.includes(scopeC.id)) scopes.push(scopeC.id);
  await prisma.assignment.create({ data: { userAccountId: managerA, scopeId: scopeC.id, roleProfileId: fm.id } });
  operarioA = await cuenta("Farm Operator", { scopeType: "location", scopeRefId: A.site });
}, 30000);

afterAll(async () => {
  // Todo lo que cuelgue de las fincas de esta corrida, también lo que creen las pruebas.
  const todas = await prisma.location.findMany({
    where: { OR: [{ id: { in: ubicaciones } }, { name: { contains: RUN } }, { organizationId: { in: organizaciones } }] },
    select: { id: true },
  });
  let ids = todas.map((l) => l.id);
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const hijos = await prisma.location.findMany({ where: { parentLocationId: { in: ids }, id: { notIn: ids } }, select: { id: true } });
    if (!hijos.length) break;
    ids = [...ids, ...hijos.map((h) => h.id)];
  }
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...ids, ...organizaciones] } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  // Hojas primero: `parent_location_id` es SET NULL, y un hijo con el padre en null ya no se encuentra.
  for (let vuelta = 0; ids.length && vuelta < 6; vuelta++) {
    const padres = new Set(
      (await prisma.location.findMany({ where: { id: { in: ids } }, select: { parentLocationId: true } }))
        .map((l) => l.parentLocationId)
        .filter((x): x is string => !!x),
    );
    const hojas = ids.filter((id) => !padres.has(id));
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: hojas } }) });
    ids = ids.filter((id) => padres.has(id));
  }
  const orgsDeLaCorrida = await prisma.organization.findMany({ where: { name: { contains: RUN } }, select: { id: true } });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: [...organizaciones, ...orgsDeLaCorrida.map((o) => o.id)] } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
}, 30000);

describe("qué fincas ve cada uno", () => {
  it("el Farm Manager de A y C ve A y C y no B; el admin ve las tres (control positivo)", async () => {
    const deManager = (await listarFincas(managerA)).map((f) => f.siteId);
    expect(deManager).toEqual(expect.arrayContaining([A.site, C.site]));
    expect(deManager).not.toContain(B.site);
    const deAdmin = (await listarFincas(admin)).map((f) => f.siteId);
    expect(deAdmin).toEqual(expect.arrayContaining([A.site, B.site]));
  }, 20000);

  it("una finca lleva su nombre, su organización y su tipo", async () => {
    const a = (await listarFincas(admin)).find((f) => f.siteId === A.site);
    expect(a).toEqual({ siteId: A.site, nombre: `TEST Finca A (${RUN})`, organizationId: A.org, tipo: "farm" });
  }, 20000);
});

describe("qué finca queda elegida", () => {
  const fa: Finca = { siteId: "a", nombre: "A", organizationId: "oa", tipo: "farm" };
  const fb: Finca = { siteId: "b", nombre: "B", organizationId: "ob", tipo: "estate" };

  it("con una sola finca, esa, aunque no haya cookie", () => {
    expect(resolverFinca([fa], undefined)).toEqual({ elegida: fa, todas: false, debeElegir: false });
  });

  it("con varias y sin cookie, hay que elegir", () => {
    expect(resolverFinca([fa, fb], undefined)).toEqual({ elegida: null, todas: false, debeElegir: true });
  });

  it("la cookie elige, «todas» ve todas, y un valor desconocido vuelve a preguntar", () => {
    expect(resolverFinca([fa, fb], "b").elegida).toEqual(fb);
    expect(resolverFinca([fa, fb], TODAS)).toEqual({ elegida: null, todas: true, debeElegir: false });
    expect(resolverFinca([fa, fb], "otra-cosa")).toEqual({ elegida: null, todas: false, debeElegir: true });
  });

  it("una cookie con una finca ajena no se acepta: la cookie sólo acota lo autorizado", async () => {
    const fincasDeA = await listarFincas(managerA);
    // Fila patrón: con una sola finca esto no probaría nada.
    expect(fincasDeA.length, "el manager necesita dos fincas para que la cookie cuente").toBeGreaterThanOrEqual(2);
    expect(resolverFinca(fincasDeA, B.site)).toEqual({ elegida: null, todas: false, debeElegir: true });
    // Control positivo: la misma cookie SÍ elige B para quien la ve.
    expect(resolverFinca(await listarFincas(admin), B.site).elegida?.siteId).toBe(B.site);
  }, 20000);
});

describe("qué cuelga de una finca", () => {
  it("el sitio, sus parcelas y sus microparcelas; nada de la otra finca", async () => {
    const todas = await prisma.location.findMany({ select: { id: true, parentLocationId: true } });
    const bajoA = idsBajoLaFinca(todas, A.site);
    expect([...bajoA]).toEqual(expect.arrayContaining([A.site, P1, M1]));
    expect(bajoA.has(Q1)).toBe(false);
    expect(bajoA.has(B.site)).toBe(false);
  }, 20000);
});

export { operarioA };
