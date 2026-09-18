import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { PERMISSIONS, ROLE_PROFILES } from "../../lib/rbac/catalog";
import { LocationAccessError, LocationValidationError, createMicrolot, updateLocationAttributes } from "../../lib/traceability/locations";
import { confirmarCoordenadasDelSitio } from "../../lib/traceability/coordenadasDelSitio";
import { actualizarBeneficio } from "../../lib/traceability/beneficios";

/**
 * «Editar beneficio» — spec #370 §4.3. Por defecto el capataz NO edita un
 * beneficio; lo hace sólo si el Farm Manager o el dueño se lo conceden
 * (Daniel, 2026-09-18). La regla es sobre escrituras: cada camino de la ficha
 * se prueba por su cuenta, con su control positivo.
 */

describe("el permiso de editar un beneficio", () => {
  it("está en el catálogo, aparte de create_site", () => {
    const acciones = PERMISSIONS.filter((p) => p.resourceType === "location").map((p) => p.action);
    expect(acciones).toContain("edit_beneficio");
    // Control positivo del mismo lector: el permiso hermano sí está.
    expect(acciones).toContain("create_site");
  });

  it("lo tiene Farm Manager y NO lo tiene Farm Operator", () => {
    const perfil = (nombre: string) => ROLE_PROFILES.find((p) => p.name === nombre)!;
    const tiene = (nombre: string, accion: string) =>
      perfil(nombre).permissions.some(([r, a]) => r === "location" && a === accion);
    expect(tiene("Farm Manager", "edit_beneficio")).toBe(true);
    expect(tiene("Farm Operator", "edit_beneficio")).toBe(false);
    // Control positivo: el operario SÍ tiene manage_attributes, que es
    // justo lo que hoy le deja editar el beneficio.
    expect(tiene("Farm Operator", "manage_attributes")).toBe(true);
  });

  it("está sembrado en la base", async () => {
    const fila = await prisma.permission.findFirst({ where: { resourceType: "location", action: "edit_beneficio" } });
    expect(fila).not.toBeNull();
  });
});

const names: string[] = [];
const accountIds: string[] = [];
const personIds: string[] = [];
const scopeIds: string[] = [];
function nombre() { const n = `TEST-EDB-${randomUUID()}`; names.push(n); return n; }

async function sitio() {
  return prisma.location.create({ data: { name: nombre(), locationType: "site", classification: "internal" } });
}
async function hijo(parentLocationId: string, locationType: "beneficio" | "plot") {
  return prisma.location.create({ data: { name: nombre(), locationType, classification: "internal", parentLocationId } });
}
async function cuenta(locationId: string, perfil: "Farm Manager" | "Farm Operator") {
  const personId = randomUUID();
  await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: "EditarBeneficio", displayName: personId } });
  personIds.push(personId);
  const userAccountId = randomUUID();
  await prisma.userAccount.create({ data: { id: userAccountId, personId, status: "active", authProvider: "credentials" } });
  accountIds.push(userAccountId);
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  // `Scope` es único por (tipo, referencia): se reutiliza si otra cuenta de
  // esta prueba ya lo creó, y sólo se borra el que creó esta corrida.
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
  const scope = existente ?? await prisma.scope.create({ data: { id: randomUUID(), scopeType: "location", scopeRefId: locationId } });
  if (!existente) scopeIds.push(scope.id);
  await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
  return userAccountId;
}
/** La concesión por persona que el plan 3 hará desde pantalla. Se cae con el
 *  Assignment: `onDelete: Cascade` en `AssignmentPermissionOverride`. */
async function conceder(userAccountId: string) {
  const asignacion = await prisma.assignment.findFirstOrThrow({ where: { userAccountId } });
  const permiso = await prisma.permission.findFirstOrThrow({ where: { resourceType: "location", action: "edit_beneficio" } });
  await prisma.assignmentPermissionOverride.create({
    data: { assignmentId: asignacion.id, permissionId: permiso.id, effect: "grant", reason: "TEST concesión de editar beneficio" },
  });
}

afterEach(async () => {
  const rows = await prisma.location.findMany({ where: { name: { in: names } }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  await prisma.auditEvent.deleteMany({ where: { entityType: "location", entityId: { in: ids } } });
  // Hijos primero, para que ninguno quede con el padre en null (SET NULL).
  await prisma.location.deleteMany({ where: { parentLocationId: { in: ids } } });
  await prisma.location.deleteMany({ where: { id: { in: ids } } });
  await prisma.assignment.deleteMany({ where: { userAccountId: { in: accountIds } } });
  await prisma.scope.deleteMany({ where: { id: { in: scopeIds } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  names.length = 0; accountIds.length = 0; personIds.length = 0; scopeIds.length = 0;
});

describe("atributos de un beneficio (updateLocationAttributes)", () => {
  it("un capataz asignado en el sitio NO los edita", async () => {
    const finca = await sitio();
    const ben = await hijo(finca.id, "beneficio");
    const capataz = await cuenta(finca.id, "Farm Operator");
    await expect(updateLocationAttributes(capataz, { locationId: ben.id, description: "cambio" }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    // Control positivo: el mismo capataz SÍ edita una parcela del mismo sitio.
    // Sin esto, la negativa se cumpliría con un capataz sin acceso a nada.
    const parc = await hijo(finca.id, "plot");
    await expect(updateLocationAttributes(capataz, { locationId: parc.id, description: "cambio" })).resolves.toBeDefined();
  });

  it("un Farm Manager sí", async () => {
    const finca = await sitio();
    const ben = await hijo(finca.id, "beneficio");
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(updateLocationAttributes(jefe, { locationId: ben.id, description: "cambio" })).resolves.toBeDefined();
  });

  it("un capataz con la concesión sí", async () => {
    const finca = await sitio();
    const ben = await hijo(finca.id, "beneficio");
    const capataz = await cuenta(finca.id, "Farm Operator");
    await conceder(capataz);
    await expect(updateLocationAttributes(capataz, { locationId: ben.id, description: "cambio" })).resolves.toBeDefined();
  });
});

describe("subdividir un beneficio (createMicrolot)", () => {
  it("se rechaza para todos: un beneficio no se parte en beneficios", async () => {
    const finca = await sitio();
    const ben = await hijo(finca.id, "beneficio");
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(createMicrolot(jefe, { parentLocationId: ben.id, name: nombre(), subdivisionReason: "other" }))
      .rejects.toThrow(new LocationValidationError("beneficio_no_se_subdivide"));
    // Control positivo: el mismo Farm Manager subdivide una parcela.
    const parc = await hijo(finca.id, "plot");
    const micro = await createMicrolot(jefe, { parentLocationId: parc.id, name: nombre(), subdivisionReason: "other" });
    expect(micro.locationType).toBe("plot");
  });
});

describe("coordenadas de un beneficio (confirmarCoordenadasDelSitio)", () => {
  it("un capataz NO las mueve; un Farm Manager sí", async () => {
    const finca = await sitio();
    const ben = await hijo(finca.id, "beneficio");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(confirmarCoordenadasDelSitio(capataz, { locationId: ben.id, latitude: 8.7, longitude: -82.4 }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    // Control positivo, el mismo camino con quien sí puede.
    await expect(confirmarCoordenadasDelSitio(jefe, { locationId: ben.id, latitude: 8.7, longitude: -82.4 })).resolves.toBeDefined();
  });

  it("el capataz sigue declarando coordenadas de una parcela", async () => {
    const finca = await sitio();
    const parc = await hijo(finca.id, "plot");
    const capataz = await cuenta(finca.id, "Farm Operator");
    await expect(confirmarCoordenadasDelSitio(capataz, { locationId: parc.id, latitude: 8.7, longitude: -82.4 })).resolves.toBeDefined();
  });
});

describe("renombrar un beneficio (actualizarBeneficio)", () => {
  it("exige edit_beneficio: el capataz con concesión renombra, sin ella no", async () => {
    const finca = await sitio();
    const ben = await hijo(finca.id, "beneficio");
    const capataz = await cuenta(finca.id, "Farm Operator");
    await expect(actualizarBeneficio(capataz, { locationId: ben.id, name: nombre() }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    await conceder(capataz);
    const nuevo = nombre();
    expect((await actualizarBeneficio(capataz, { locationId: ben.id, name: nuevo })).name).toBe(nuevo);
  });
});
