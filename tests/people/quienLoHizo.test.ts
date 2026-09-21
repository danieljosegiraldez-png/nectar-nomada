/**
 * Quién puede figurar en «quién lo hizo» (decisión P-G, 2026-09-21).
 *
 * Spec: docs/superpowers/specs/2026-09-21-quien-lo-hizo-acotado-design.md.
 *
 * La base es compartida y corren otros archivos a la vez, así que **nunca se afirma un
 * recuento**: otras corridas pueden tener administradores de plataforma o miembros de una
 * organización Néctar Nómada vivos en este instante, y ésos entran —con razón— en el bloque del
 * equipo. Se afirma sobre las personas que este archivo crea, cada una por su id.
 *
 * Grupo `base-sembrada`: necesita los perfiles del catálogo sembrados.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { PersonaNoPermitidaError, exigirPersonaPermitida, personasPermitidas } from "../../lib/people/quienLoHizo";

const RUN = `qlh-${Date.now()}`;
const personas: string[] = [];
const cuentas: string[] = [];
const scopes: string[] = [];
const organizaciones: string[] = [];
const ubicaciones: string[] = [];
const proyectos: string[] = [];

let A: { org: string; site: string; plot: string; project: string };
let B: { org: string; site: string };
let sinOrg: string;

let operarioA: { cuenta: string; persona: string };
let proyectoA: { cuenta: string; persona: string };
let operarioB: { cuenta: string; persona: string };
let miembroA: string;
let exMiembroA: string;
let archivadoA: string;
let equipoNN: string;

async function persona(nombre: string, status: "active" | "archived" = "active") {
  const id = randomUUID();
  await prisma.person.create({
    data: { id, givenName: "TEST", familyName: nombre, displayName: `TEST ${nombre} (${RUN})`, email: `${nombre}.${RUN}@example.test`, phone: "+507 0000-0000", status },
  });
  personas.push(id);
  return id;
}

async function cuenta(nombre: string, scope: { scopeType: "location" | "project" | "platform"; scopeRefId: string | null }) {
  const personId = await persona(nombre);
  const id = randomUUID();
  await prisma.userAccount.create({ data: { id, personId, status: "active", authProvider: "credentials" } });
  cuentas.push(id);
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const existente = await prisma.scope.findFirst({ where: scope });
  const s = existente ?? (await prisma.scope.create({ data: { id: randomUUID(), ...scope } }));
  if (!existente) scopes.push(s.id);
  await prisma.assignment.create({ data: { userAccountId: id, scopeId: s.id, roleProfileId: roleProfile.id } });
  return { cuenta: id, persona: personId };
}

async function organizacion(nombre: string, organizationType: "farm" | "nectar_nomada_partner") {
  const org = await prisma.organization.create({
    data: { organizationType, name: `TEST ${nombre} (${RUN})`, status: "approved", classification: "internal" },
  });
  organizaciones.push(org.id);
  return org.id;
}

async function lugar(nombre: string, data: { locationType: "site" | "plot"; organizationId?: string; parentLocationId?: string }) {
  const l = await prisma.location.create({ data: { name: `TEST ${nombre} (${RUN})`, classification: "internal", ...data } });
  ubicaciones.push(l.id);
  return l.id;
}

async function miembro(personId: string, organizationId: string, status: "active" | "ended" = "active") {
  await prisma.organizationMembership.create({ data: { personId, organizationId, status } });
}

beforeAll(async () => {
  const orgA = await organizacion("Finca A", "farm");
  const siteA = await lugar("Finca A", { locationType: "site", organizationId: orgA });
  const plotA = await lugar("Parcela A", { locationType: "plot", parentLocationId: siteA });
  const projectA = await prisma.project.create({ data: { name: `TEST Proyecto A (${RUN})`, organizationId: orgA } });
  proyectos.push(projectA.id);
  A = { org: orgA, site: siteA, plot: plotA, project: projectA.id };

  const orgB = await organizacion("Finca B", "farm");
  B = { org: orgB, site: await lugar("Finca B", { locationType: "site", organizationId: orgB }) };
  sinOrg = await lugar("Sitio sin organización", { locationType: "site" });

  // Asignación sobre la PARCELA, no sobre el sitio: la organización efectiva se hereda subiendo.
  operarioA = await cuenta("OperarioA", { scopeType: "location", scopeRefId: A.plot });
  proyectoA = await cuenta("ProyectoA", { scopeType: "project", scopeRefId: A.project });
  operarioB = await cuenta("OperarioB", { scopeType: "location", scopeRefId: B.site });

  miembroA = await persona("MiembroA");
  await miembro(miembroA, A.org);
  exMiembroA = await persona("ExMiembroA");
  await miembro(exMiembroA, A.org, "ended");
  archivadoA = await persona("ArchivadoA", "archived");
  await miembro(archivadoA, A.org);

  const orgNN = await organizacion("Néctar Nómada", "nectar_nomada_partner");
  equipoNN = await persona("EquipoNN");
  await miembro(equipoNN, orgNN);
});

afterAll(async () => {
  await prisma.organizationMembership.deleteMany({ where: { personId: { in: personas } } });
  await prisma.assignment.deleteMany({ where: { userAccountId: { in: cuentas } } });
  await prisma.scope.deleteMany({ where: { id: { in: scopes } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: cuentas } } });
  await prisma.person.deleteMany({ where: { id: { in: personas } } });
  await prisma.project.deleteMany({ where: { id: { in: proyectos } } });
  await prisma.location.deleteMany({ where: { id: { in: [...ubicaciones].reverse() } } });
  await prisma.organization.deleteMany({ where: { id: { in: organizaciones } } });
});

const grupos = (people: { id: string; grupo: string }[]) => new Map(people.map((p) => [p.id, p.grupo]));

describe("personasPermitidas", () => {
  it("anclado en una parcela de A: los de A en su bloque, el equipo aparte, quien registra primero", async () => {
    const { people, selfPersonId } = await personasPermitidas(operarioA.cuenta, [{ locationId: A.plot }]);
    const g = grupos(people);
    expect(selfPersonId).toBe(operarioA.persona);
    expect(people[0]?.id).toBe(operarioA.persona);
    expect(g.get(operarioA.persona)).toBe("yo");
    expect(g.get(proyectoA.persona)).toBe("finca");
    expect(g.get(miembroA)).toBe("finca");
    expect(g.get(equipoNN)).toBe("equipo");
  });

  it("nadie de otra finca, ni quien ya se fue, ni una persona archivada", async () => {
    const g = grupos((await personasPermitidas(operarioA.cuenta, [{ locationId: A.plot }])).people);
    expect(g.has(operarioB.persona)).toBe(false);
    expect(g.has(exMiembroA)).toBe(false);
    expect(g.has(archivadoA)).toBe(false);
  });

  it("el bloque de la finca va antes que el del equipo", async () => {
    const { people } = await personasPermitidas(operarioA.cuenta, [{ locationId: A.plot }]);
    const ultimaFinca = people.map((p) => p.grupo).lastIndexOf("finca");
    const primeraEquipo = people.map((p) => p.grupo).indexOf("equipo");
    expect(ultimaFinca).toBeGreaterThan(0);
    expect(primeraEquipo).toBeGreaterThan(ultimaFinca);
  });

  it("sin lugar, el ancla es la organización del proyecto", async () => {
    const g = grupos((await personasPermitidas(proyectoA.cuenta, [{ projectId: A.project }])).people);
    expect(g.get(operarioA.persona)).toBe("finca");
    expect(g.get(miembroA)).toBe("finca");
    expect(g.has(operarioB.persona)).toBe(false);
  });

  it("vista desde la finca B, A no aparece", async () => {
    const g = grupos((await personasPermitidas(operarioB.cuenta, [{ locationId: B.site }])).people);
    expect(g.get(operarioB.persona)).toBe("yo");
    expect(g.has(operarioA.persona)).toBe(false);
    expect(g.has(miembroA)).toBe(false);
    expect(g.get(equipoNN)).toBe("equipo");
  });

  it("un ancla sin organización sólo deja al equipo y a quien registra", async () => {
    const g = grupos((await personasPermitidas(operarioA.cuenta, [{ locationId: sinOrg }])).people);
    expect(g.get(operarioA.persona)).toBe("yo");
    expect(g.get(equipoNN)).toBe("equipo");
    expect(g.has(miembroA)).toBe(false);
    expect(g.has(proyectoA.persona)).toBe(false);
  });

  it("al navegador sólo llega id, nombre y bloque: nunca correo ni teléfono", async () => {
    const { people } = await personasPermitidas(operarioA.cuenta, [{ locationId: A.plot }]);
    const miembro = people.find((p) => p.id === miembroA);
    expect(miembro).toBeDefined();
    expect(Object.keys(miembro!).sort()).toEqual(["displayName", "grupo", "id"]);
    expect(JSON.stringify(people)).not.toContain("@example.test");
  });
});

describe("exigirPersonaPermitida", () => {
  it("rechaza a una persona de otra finca", async () => {
    await expect(exigirPersonaPermitida(operarioA.cuenta, operarioB.persona, [{ locationId: A.plot }])).rejects.toBeInstanceOf(PersonaNoPermitidaError);
  });

  it("rechaza a quien ya dejó la finca", async () => {
    await expect(exigirPersonaPermitida(operarioA.cuenta, exMiembroA, [{ locationId: A.plot }])).rejects.toBeInstanceOf(PersonaNoPermitidaError);
  });

  it("acepta a un miembro de la finca, al equipo, a sí misma y a nadie", async () => {
    await expect(exigirPersonaPermitida(operarioA.cuenta, miembroA, [{ locationId: A.plot }])).resolves.toBeUndefined();
    await expect(exigirPersonaPermitida(operarioA.cuenta, equipoNN, [{ locationId: A.plot }])).resolves.toBeUndefined();
    await expect(exigirPersonaPermitida(operarioA.cuenta, operarioA.persona, [{ locationId: A.plot }])).resolves.toBeUndefined();
    await expect(exigirPersonaPermitida(operarioA.cuenta, null, [{ locationId: A.plot }])).resolves.toBeUndefined();
  });

  it("dentro de una transacción usa esa transacción", async () => {
    await prisma.$transaction(async (tx) => {
      await expect(exigirPersonaPermitida(operarioA.cuenta, operarioB.persona, [{ locationId: A.plot }], tx)).rejects.toBeInstanceOf(PersonaNoPermitidaError);
    });
  });
});
