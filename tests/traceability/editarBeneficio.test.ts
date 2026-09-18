import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { PERMISSIONS, ROLE_PROFILES } from "../../lib/rbac/catalog";
import { LocationAccessError, LocationValidationError, createMicrolot, updateLocationAttributes } from "../../lib/traceability/locations";
import { confirmarCoordenadasDelSitio } from "../../lib/traceability/coordenadasDelSitio";
import { actualizarBeneficio } from "../../lib/traceability/beneficios";
import { actualizarUbicacionDeSecado, crearUbicacionDeSecado } from "../../lib/traceability/instalaciones";
import { createRecipeVersion, createRecipeWithVersion, updateRecipeMetadata } from "../../lib/traceability/processTargets";

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
  // Nietos (camas bajo instalación): primero, para que ninguno quede con el padre en null.
  const hijos = await prisma.location.findMany({ where: { parentLocationId: { in: ids } }, select: { id: true } });
  await prisma.location.deleteMany({ where: { parentLocationId: { in: hijos.map((h) => h.id) } } });
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

  it("un Farm Manager asignado en OTRO sitio no edita un beneficio de éste", async () => {
    const finca1 = await sitio();
    const finca2 = await sitio();
    const ben = await hijo(finca1.id, "beneficio");
    const jefeDeOtroSitio = await cuenta(finca2.id, "Farm Manager");
    // `updateLocationAttributes` llama primero a `requireLocationAttributeAccess`
    // y sólo después a `exigeEditarBeneficioSiLoEs`. Sin ninguna asignación
    // sobre finca1, la primera guardia ya rechaza: el mensaje observado es
    // `no_location_attribute_access`, no `no_beneficio_edit_access`.
    await expect(updateLocationAttributes(jefeDeOtroSitio, { locationId: ben.id, description: "cambio" }))
      .rejects.toThrow(new LocationAccessError("no_location_attribute_access"));
    // Control positivo: el mismo Farm Manager SÍ edita un beneficio de SU
    // propio sitio. Sin esto, el rechazo de arriba se cumpliría igual con una
    // cuenta sin ningún acceso en ninguna parte.
    const benPropio = await hijo(finca2.id, "beneficio");
    await expect(updateLocationAttributes(jefeDeOtroSitio, { locationId: benPropio.id, description: "cambio" })).resolves.toBeDefined();
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

describe("instalaciones y camas (crearUbicacionDeSecado, actualizarUbicacionDeSecado)", () => {
  it("un capataz NO crea una instalación en su sitio; un Farm Manager sí", async () => {
    const finca = await sitio();
    const capataz = await cuenta(finca.id, "Farm Operator");
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(crearUbicacionDeSecado(capataz, { name: nombre(), parentLocationId: finca.id, locationType: "drying_facility" }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    // Control positivo: el mismo camino con quien sí puede.
    const inst = await crearUbicacionDeSecado(jefe, { name: nombre(), parentLocationId: finca.id, locationType: "drying_facility" });
    expect(inst.locationType).toBe("drying_facility");
  });

  it("un capataz NO edita ni crea camas; con la concesión, sí", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const inst = await crearUbicacionDeSecado(jefe, { name: nombre(), parentLocationId: finca.id, locationType: "drying_facility" });
    await expect(actualizarUbicacionDeSecado(capataz, { locationId: inst.id, name: nombre() }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    await expect(crearUbicacionDeSecado(capataz, { name: nombre(), parentLocationId: inst.id, locationType: "drying_bed" }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    await conceder(capataz);
    await expect(actualizarUbicacionDeSecado(capataz, { locationId: inst.id, name: nombre() })).resolves.toBeDefined();
    const cama = await crearUbicacionDeSecado(capataz, { name: nombre(), parentLocationId: inst.id, locationType: "drying_bed" });
    expect(cama.locationType).toBe("drying_bed");
  });
});

describe("recetas (crear, editar, publicar)", () => {
  const orgIds: string[] = [];
  const lotIds: string[] = [];
  const recetaNombres: string[] = [];
  afterEach(async () => {
    const recetas = await prisma.processRecipe.findMany({ where: { name: { in: recetaNombres } }, select: { id: true } });
    await prisma.auditEvent.deleteMany({ where: { entityId: { in: recetas.map((r) => r.id) } } });
    await prisma.processRecipe.deleteMany({ where: { name: { in: recetaNombres } } });
    await prisma.lot.deleteMany({ where: { id: { in: lotIds } } });
    // La finca de la organización la borra el afterEach general (por nombre); aquí se suelta antes su organización.
    await prisma.location.updateMany({ where: { organizationId: { in: orgIds } }, data: { organizationId: null } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    orgIds.length = 0; lotIds.length = 0; recetaNombres.length = 0;
  });

  /** Una organización con su finca y un lote en ella: el capataz de la finca gestiona ese lote. */
  async function fincaConLote() {
    const org = await prisma.organization.create({ data: { name: nombre(), organizationType: "farm" } });
    orgIds.push(org.id);
    const finca = await prisma.location.create({ data: { name: nombre(), locationType: "site", classification: "internal", organizationId: org.id } });
    const lot = await prisma.lot.create({ data: { lotCode: nombre(), lotType: "cherry", organizationId: org.id, locationId: finca.id, classification: "internal" } });
    lotIds.push(lot.id);
    return { org, finca };
  }
  // `targets: []` no pasa `validateTargets` (`at_least_one_target_required`,
  // un ProcessTargetError) antes de llegar a la guardia bajo prueba, así que
  // se usa el mínimo válido: el mismo objetivo de humo que
  // tests/traceability/recipeAuthoring.test.ts.
  const unTarget = [{ variable: "ph", moment: "final" as const, unit: "pH", targetValue: 3.8 }];
  const receta = (organizationId: string | null) => {
    const name = nombre(); recetaNombres.push(name);
    return { name, organizationId, targets: unTarget };
  };

  /** Concede a una cuenta YA existente una asignación Farm Manager adicional
   *  sobre otro ámbito, sin crear una cuenta nueva. Reutiliza el Scope si ya
   *  existe, igual que `cuenta()`. */
  async function tambienGestiona(userAccountId: string, scopeType: "location" | "project", scopeRefId: string) {
    const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
    const existente = await prisma.scope.findFirst({ where: { scopeType, scopeRefId } });
    const scope = existente ?? await prisma.scope.create({ data: { id: randomUUID(), scopeType, scopeRefId } });
    if (!existente) scopeIds.push(scope.id);
    await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
  }

  it("un capataz NO crea una receta de su organización; un Farm Manager sí", async () => {
    const { org, finca } = await fincaConLote();
    const capataz = await cuenta(finca.id, "Farm Operator");
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(createRecipeWithVersion(capataz, receta(org.id))).rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    await expect(createRecipeWithVersion(jefe, receta(org.id))).resolves.toBeDefined();
  });

  it("un capataz NO edita ni publica; con la concesión, sí", async () => {
    const { org, finca } = await fincaConLote();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    // `createRecipeWithVersion` devuelve el `ProcessRecipe` directamente
    // (con sus versiones incluidas), no envuelto — `creada.id` es el id de
    // la receta, no de una versión.
    const original = receta(org.id);
    const creada = await createRecipeWithVersion(jefe, original);
    await expect(updateRecipeMetadata(capataz, creada.id, { name: nombre() })).rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    await conceder(capataz);
    // Vuelve a poner el nombre rastreado (`original.name`, no el `nombre()`
    // suelto de la línea de arriba) para que el `afterEach` de este describe
    // la encuentre por nombre.
    await expect(updateRecipeMetadata(capataz, creada.id, { name: original.name })).resolves.toBeDefined();
  });

  it("un capataz NO publica una versión nueva; con la concesión, sí", async () => {
    const { org, finca } = await fincaConLote();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const creada = await createRecipeWithVersion(jefe, receta(org.id));
    await expect(createRecipeVersion(capataz, creada.id, unTarget)).rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    await conceder(capataz);
    await expect(createRecipeVersion(capataz, creada.id, unTarget)).resolves.toBeDefined();
  });

  it("una receta compartida (sin organización) no la crea un Farm Manager de finca", async () => {
    const { finca } = await fincaConLote();
    const jefe = await cuenta(finca.id, "Farm Manager");
    // Para `organizationId: null`, `createRecipeWithVersion` busca el gate de
    // `requireLotAccess` en CUALQUIER lote de la base compartida (línea ~330
    // de processTargets.ts) — no en uno del jefe. Sin dársela, el jefe cae
    // antes de llegar a la guardia bajo prueba, con `no_lot_access` de
    // `requireLotAccess`, no con `no_beneficio_edit_access`. Se le concede la
    // MISMA asignación (Farm Manager, ámbito de ubicación) sobre el lugar de
    // ese lote arbitrario — nunca ámbito de plataforma, que es justo lo que
    // el guardia bajo prueba exige y lo que este jefe no tiene.
    const cualquierLote = await prisma.lot.findFirst({ where: {} });
    if (cualquierLote?.locationId) await tambienGestiona(jefe, "location", cualquierLote.locationId);
    else if (cualquierLote?.projectId) await tambienGestiona(jefe, "project", cualquierLote.projectId);
    await expect(createRecipeWithVersion(jefe, receta(null)))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
  });
});
