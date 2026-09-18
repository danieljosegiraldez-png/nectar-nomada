import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/db";
import * as audit from "../../lib/audit";
import { actualizarUbicacionDeSecado, crearUbicacionDeSecado, detalleInstalacion, listarInstalaciones, sitiosParaInstalaciones } from "../../lib/traceability/instalaciones";

const names: string[] = [];
const accountIds: string[] = [];
const personIds: string[] = [];
const scopeIds: string[] = [];
const profileIds: string[] = [];
function nombre() { const n = `TEST-INST-${randomUUID()}`; names.push(n); return n; }
function id(ids: string[]) { const value = randomUUID(); ids.push(value); return value; }
async function sitio() {
  return prisma.location.create({ data: { name: nombre(), locationType: "site", classification: "internal" } });
}
async function cuenta(locationId?: string, perfil: "Farm Manager" | "Farm Operator" = "Farm Manager") {
  const personId = id(personIds);
  await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: "Instalaciones", displayName: personId } });
  const userAccountId = id(accountIds);
  await prisma.userAccount.create({ data: { id: userAccountId, personId, status: "active", authProvider: "credentials" } });
  if (locationId) {
    const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
    // `Scope` es único por (tipo, referencia): dos cuentas sobre el MISMO sitio
    // comparten ámbito. Crearlo a ciegas rompía la prueba que necesita dos
    // actores sobre el mismo sitio — uno con el permiso y otro sin él.
    const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
    const scopeId = existente?.id ?? id(scopeIds);
    if (!existente) {
      await prisma.scope.create({ data: { id: scopeId, scopeType: "location", scopeRefId: locationId } });
    }
    await prisma.assignment.create({ data: { userAccountId, scopeId, roleProfileId: profile.id } });
  }
  return userAccountId;
}
async function instalacion(actor: string, parentLocationId: string) {
  return crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId, locationType: "drying_facility", dryingEnvironment: "solar_greenhouse" });
}
afterEach(async () => {
  vi.restoreAllMocks();
  // Por nombre reservado ANTES de escribir: también recoge una escritura indebida que no retornó.
  const where = { name: { in: names } };
  const rows = await prisma.location.findMany({ where, select: { id: true } });
  const auditWhere = { entityType: "location", entityId: { in: rows.map((r) => r.id) } };
  await prisma.auditEvent.deleteMany({ where: auditWhere });
  await prisma.assignment.deleteMany({ where: { userAccountId: { in: accountIds } } });
  await prisma.roleProfile.deleteMany({ where: { id: { in: profileIds } } });
  await prisma.scope.deleteMany({ where: { id: { in: scopeIds } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  // Hijos antes que padres, sin tocar filas ajenas.
  for (const locationType of ["drying_bed", "drying_facility", "site"] as const) {
    await prisma.location.deleteMany({ where: { ...where, locationType } });
  }
  expect(await prisma.location.count({ where })).toBe(0);
  expect(await prisma.auditEvent.count({ where: auditWhere })).toBe(0);
  expect(await prisma.userAccount.count({ where: { id: { in: accountIds } } })).toBe(0);
  expect(await prisma.person.count({ where: { id: { in: personIds } } })).toBe(0);
  expect(await prisma.scope.count({ where: { id: { in: scopeIds } } })).toBe(0);
  for (const ids of [names, accountIds, personIds, scopeIds, profileIds]) ids.length = 0;
});

describe("administración del árbol sitio → instalación → cama", () => {
  it("control positivo: el permiso sobre el sitio crea, lista y edita instalación y cama con auditoría", async () => {
    const parent = await sitio();
    const actor = await cuenta(parent.id);
    const facility = await instalacion(actor, parent.id);
    const bed = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: facility.id, locationType: "drying_bed", rackLevel: 2 });
    expect(facility).toMatchObject({ parentLocationId: parent.id, locationType: "drying_facility", classification: parent.classification, dryingEnvironment: "solar_greenhouse" });
    expect(bed).toMatchObject({ parentLocationId: facility.id, locationType: "drying_bed", rackLevel: 2 });
    expect(await sitiosParaInstalaciones(actor)).toEqual([{ id: parent.id, name: parent.name }]);
    expect((await listarInstalaciones(actor)).map((r) => r.id)).toContain(facility.id);
    expect(await detalleInstalacion(actor, facility.id)).toMatchObject({ sitio: { id: parent.id }, camas: [{ id: bed.id, rackLevel: 2 }] });
    expect(await actualizarUbicacionDeSecado(actor, { locationId: bed.id, name: bed.name, rackLevel: 3 })).toMatchObject({ rackLevel: 3 });
    expect(await actualizarUbicacionDeSecado(actor, { locationId: facility.id, name: facility.name, dryingEnvironment: "covered_patio" })).toMatchObject({ dryingEnvironment: "covered_patio" });
    expect(await prisma.auditEvent.count({ where: { entityId: { in: [facility.id, bed.id] }, entityType: "location" } })).toBe(4);
  });

  it("sin permiso falla al crear y al abrir las opciones/lista/detalle; no devuelve una pantalla vacía", async () => {
    const parent = await sitio();
    const autorizado = await cuenta(parent.id);
    const facility = await instalacion(autorizado, parent.id); // control positivo en el mismo contexto
    const sinPermiso = await cuenta();
    await expect(instalacion(sinPermiso, parent.id)).rejects.toThrow("no_location_attribute_access");
    await expect(sitiosParaInstalaciones(sinPermiso)).rejects.toThrow("no_location_attribute_access");
    await expect(listarInstalaciones(sinPermiso)).rejects.toThrow("no_location_attribute_access");
    await expect(detalleInstalacion(sinPermiso, facility.id)).rejects.toThrow("no_location_attribute_access");
    await expect(actualizarUbicacionDeSecado(sinPermiso, { locationId: facility.id, name: facility.name })).rejects.toThrow("no_location_attribute_access");
    expect((await detalleInstalacion(autorizado, facility.id)).id).toBe(facility.id);
    expect(await prisma.location.count({ where: { parentLocationId: parent.id } })).toBe(1);
  });

  it("el permiso sobre otro sitio no autoriza el padre enviado ni sus camas", async () => {
    const parent = await sitio();
    const other = await sitio();
    const actor = await cuenta(parent.id);
    const ajeno = await cuenta(other.id);
    const facility = await instalacion(actor, parent.id);
    await instalacion(ajeno, other.id); // control positivo de la cuenta ajena
    await expect(instalacion(ajeno, parent.id)).rejects.toThrow("no_location_attribute_access");
    await expect(crearUbicacionDeSecado(ajeno, { name: nombre(), locationType: "drying_bed", parentLocationId: facility.id })).rejects.toThrow("no_location_attribute_access");
    const bed = await crearUbicacionDeSecado(actor, { name: nombre(), locationType: "drying_bed", parentLocationId: facility.id });
    await expect(actualizarUbicacionDeSecado(ajeno, { locationId: bed.id, name: bed.name, rackLevel: 2 })).rejects.toThrow("no_location_attribute_access");
    expect((await listarInstalaciones(ajeno)).map((r) => r.id)).not.toContain(facility.id);
    expect((await listarInstalaciones(actor)).map((r) => r.id)).toContain(facility.id);
  });

  it("tener los demás permisos de Farm Operator sin location:manage_attributes no permite crear", async () => {
    const parent = await sitio();
    const actor = await cuenta(parent.id);
    const sinAtributos = await cuenta(parent.id);
    const original = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" }, include: { permissions: { include: { permission: true } } } });
    const profileId = id(profileIds);
    await prisma.roleProfile.create({ data: {
      id: profileId, name: `TEST-INST-ROLE-${profileId}`,
      permissions: { create: original.permissions.filter((p) => !(p.permission.resourceType === "location" && p.permission.action === "manage_attributes")).map((p) => ({ permissionId: p.permissionId })) },
    } });
    await prisma.assignment.updateMany({ where: { userAccountId: sinAtributos }, data: { roleProfileId: profileId } });
    expect((await instalacion(actor, parent.id)).parentLocationId).toBe(parent.id);
    await expect(instalacion(sinAtributos, parent.id)).rejects.toThrow("no_location_attribute_access");
    await expect(sitiosParaInstalaciones(sinAtributos)).rejects.toThrow("no_location_attribute_access");
  });

  it("un sitio autorizado sin instalaciones sí devuelve lista vacía", async () => {
    const parent = await sitio();
    expect(await listarInstalaciones(await cuenta(parent.id))).toEqual([]);
  });

  it("valida los tipos de padre y el nivel de rack con sus entradas válidas al lado", async () => {
    const parent = await sitio();
    const actor = await cuenta(parent.id);
    const facility = await instalacion(actor, parent.id);
    await expect(instalacion(actor, facility.id)).rejects.toThrow("tipo_invalido");
    await expect(crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: parent.id, locationType: "drying_bed" })).rejects.toThrow("tipo_invalido");
    for (const rackLevel of [0, -1, 1.5]) {
      await expect(crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: facility.id, locationType: "drying_bed", rackLevel })).rejects.toThrow("rack_invalido");
    }
    for (const rackLevel of [null, 1]) {
      expect((await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: facility.id, locationType: "drying_bed", rackLevel })).rackLevel).toBe(rackLevel);
    }
  });

  it("revierte creación y edición si falla su AuditEvent", async () => {
    const parent = await sitio();
    const actor = await cuenta(parent.id);
    const facility = await instalacion(actor, parent.id);
    const spy = vi.spyOn(audit, "recordAuditEvent").mockRejectedValue(new Error("TEST audit falló"));
    await expect(instalacion(actor, parent.id)).rejects.toThrow("TEST audit falló");
    await expect(actualizarUbicacionDeSecado(actor, { locationId: facility.id, name: facility.name, dryingEnvironment: "open_patio" })).rejects.toThrow("TEST audit falló");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await prisma.location.count({ where: { parentLocationId: parent.id } })).toBe(1);
    expect((await prisma.location.findUniqueOrThrow({ where: { id: facility.id } })).dryingEnvironment).toBe("solar_greenhouse");
  });
});
