/**
 * Quitar y añadir permisos sobre UNA asignación, sin clonar perfiles.
 *
 * **Decisión de Daniel, 2026-09-16**: «en admin quitar o agregar permisos como
 * correspondan para personalizar». Hasta hoy el resolutor sólo SUMABA: se podían
 * dar más perfiles, no quitar un permiso concreto.
 *
 * **Este archivo existe sobre todo por lo que NO debe pasar.** Ensanchar un motor
 * de autorización sin fijar dónde termina es como se abren agujeros, y aquí hay
 * tres límites que tienen que caer si alguien los rompe: que el `deny` gane, que
 * un ajuste no se escape a OTRA asignación de la misma persona, y que un `grant`
 * sin razón no entre.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/db";
import { can } from "../../lib/rbac/service";

const marca = `TEST-AJU-${randomUUID()}`;
const creados = { personas: [] as string[], cuentas: [] as string[], scopes: [] as string[], asignaciones: [] as string[], ubicaciones: [] as string[] };
let permisoLote: { id: string };
let permisoEquipo: { id: string };

async function ubicacion() {
  const l = await prisma.location.create({ data: { name: `${marca}-${creados.ubicaciones.length}`, locationType: "site", classification: "internal" } });
  creados.ubicaciones.push(l.id);
  return l;
}

async function cuentaCon(perfil: string, locationId: string) {
  const persona = await prisma.person.create({ data: { givenName: "TEST", familyName: "Ajustes", displayName: `${marca}-${creados.personas.length}` } });
  creados.personas.push(persona.id);
  const cuenta = await prisma.userAccount.create({ data: { personId: persona.id, status: "active", authProvider: "credentials" } });
  creados.cuentas.push(cuenta.id);
  const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } });
  creados.scopes.push(scope.id);
  const a = await prisma.assignment.create({ data: { userAccountId: cuenta.id, scopeId: scope.id, roleProfileId: p.id } });
  creados.asignaciones.push(a.id);
  return { cuentaId: cuenta.id, assignmentId: a.id };
}

beforeAll(async () => {
  permisoLote = await prisma.permission.findFirstOrThrow({ where: { resourceType: "lot", action: "manage" } });
  permisoEquipo = await prisma.permission.findFirstOrThrow({ where: { resourceType: "equipment", action: "manage" } });
});

afterEach(async () => {
  await prisma.assignmentPermissionOverride.deleteMany({ where: { assignmentId: { in: creados.asignaciones } } });
  await prisma.assignment.deleteMany({ where: { id: { in: creados.asignaciones } } });
  await prisma.scope.deleteMany({ where: { id: { in: creados.scopes } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: creados.cuentas } } });
  await prisma.person.deleteMany({ where: { id: { in: creados.personas } } });
  await prisma.location.deleteMany({ where: { id: { in: creados.ubicaciones } } });
  for (const k of Object.keys(creados) as (keyof typeof creados)[]) creados[k].length = 0;
});

const puede = (cuentaId: string, recurso: string, accion: string, locationId: string) =>
  can(cuentaId, accion, recurso, { scopeType: "location", scopeRefId: locationId }, "internal");

describe("quitar un permiso que el perfil sí concede", () => {
  it("el `deny` gana sobre el perfil, y NO toca los demás permisos", async () => {
    const sitio = await ubicacion();
    const { cuentaId, assignmentId } = await cuentaCon("Farm Operator", sitio.id);

    // Control positivo ANTES de quitar: sin esto, una prueba que sólo mira el
    // «no puede» de abajo pasaría igual con un perfil vacío.
    expect(await puede(cuentaId, "lot", "manage", sitio.id)).toBe(true);
    expect(await puede(cuentaId, "sample", "manage", sitio.id)).toBe(true);

    await prisma.assignmentPermissionOverride.create({
      data: { assignmentId, permissionId: permisoLote.id, effect: "deny" },
    });

    expect(await puede(cuentaId, "lot", "manage", sitio.id)).toBe(false);
    // Y lo demás sigue en pie: quitar uno no descabeza el perfil entero.
    expect(await puede(cuentaId, "sample", "manage", sitio.id)).toBe(true);
  });
});

describe("añadir un permiso que el perfil no concede", () => {
  it("el `grant` concede, y exige razón escrita", async () => {
    const sitio = await ubicacion();
    const { cuentaId, assignmentId } = await cuentaCon("Farm Operator", sitio.id);

    // Farm Operator ve equipo pero NO puede registrarlo ni retirarlo: su propio
    // comentario dice que eso es «del jefe de beneficio, no del operario».
    expect(await puede(cuentaId, "equipment", "manage", sitio.id)).toBe(false);

    // Sin razón, la BASE lo rechaza — no sólo el servicio. Un importador o un SQL
    // directo se saltan el servicio; no se saltan el CHECK.
    await expect(
      prisma.assignmentPermissionOverride.create({
        data: { assignmentId, permissionId: permisoEquipo.id, effect: "grant" },
      }),
    ).rejects.toThrow(/apo_grant_exige_razon/);

    await prisma.assignmentPermissionOverride.create({
      data: { assignmentId, permissionId: permisoEquipo.id, effect: "grant", reason: "Cubre a Dionelio mientras está de vacaciones (2026-09)." },
    });
    expect(await puede(cuentaId, "equipment", "manage", sitio.id)).toBe(true);
  });

  it("un `deny` NO necesita razón: quitar sólo puede estrechar", async () => {
    const sitio = await ubicacion();
    const { assignmentId } = await cuentaCon("Farm Operator", sitio.id);
    const o = await prisma.assignmentPermissionOverride.create({
      data: { assignmentId, permissionId: permisoLote.id, effect: "deny" },
    });
    expect(o.reason).toBeNull();
  });
});

describe("los límites, que es por lo que este archivo existe", () => {
  it("un ajuste NO se escapa a otra asignación de la misma persona", async () => {
    // Dos sitios, dos asignaciones, una sola persona. Quitar en uno no puede
    // quitar en el otro: el ajuste vive donde vive la concesión.
    const sitioA = await ubicacion();
    const sitioB = await ubicacion();
    const { cuentaId, assignmentId } = await cuentaCon("Farm Operator", sitioA.id);

    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scopeB = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitioB.id } });
    creados.scopes.push(scopeB.id);
    const aB = await prisma.assignment.create({ data: { userAccountId: cuentaId, scopeId: scopeB.id, roleProfileId: perfil.id } });
    creados.asignaciones.push(aB.id);

    await prisma.assignmentPermissionOverride.create({
      data: { assignmentId, permissionId: permisoLote.id, effect: "deny" },
    });

    expect(await puede(cuentaId, "lot", "manage", sitioA.id)).toBe(false);
    expect(await puede(cuentaId, "lot", "manage", sitioB.id)).toBe(true);
  });

  it("no deja conceder y quitar el MISMO permiso en la misma asignación", async () => {
    // No es una precedencia que resolver: es una contradicción, y la base la
    // impide antes de que nadie tenga que decidirla.
    const sitio = await ubicacion();
    const { assignmentId } = await cuentaCon("Farm Operator", sitio.id);
    await prisma.assignmentPermissionOverride.create({
      data: { assignmentId, permissionId: permisoLote.id, effect: "deny" },
    });
    await expect(
      prisma.assignmentPermissionOverride.create({
        data: { assignmentId, permissionId: permisoLote.id, effect: "grant", reason: "contradictorio a propósito" },
      }),
    ).rejects.toThrow();
  });

  it("el ajuste muere con su asignación", async () => {
    const sitio = await ubicacion();
    const { assignmentId } = await cuentaCon("Farm Operator", sitio.id);
    await prisma.assignmentPermissionOverride.create({
      data: { assignmentId, permissionId: permisoLote.id, effect: "deny" },
    });
    await prisma.assignment.delete({ where: { id: assignmentId } });
    creados.asignaciones = creados.asignaciones.filter((x) => x !== assignmentId);
    expect(await prisma.assignmentPermissionOverride.count({ where: { assignmentId } })).toBe(0);
  });
});

describe("el perfil Farm Manager", () => {
  it("puede registrar equipo, que es lo que lo separa del operario", async () => {
    const sitio = await ubicacion();
    const { cuentaId } = await cuentaCon("Farm Manager", sitio.id);
    expect(await puede(cuentaId, "equipment", "manage", sitio.id)).toBe(true);
    expect(await puede(cuentaId, "project", "manage_operations", sitio.id)).toBe(true);
  });

  it("y NO puede lo que se le excluyó a propósito — el control que da sentido al perfil", async () => {
    const sitio = await ubicacion();
    const { cuentaId } = await cuentaCon("Farm Manager", sitio.id);
    // Un perfil que lo concediera todo no seria un perfil: seria un Platform Admin
    // con otro nombre.
    expect(await puede(cuentaId, "lot", "override_balance", sitio.id)).toBe(false);
    expect(await puede(cuentaId, "platform", "manage_users", sitio.id)).toBe(false);
  });
});
