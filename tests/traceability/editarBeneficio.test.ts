import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { PERMISSIONS, ROLE_PROFILES } from "../../lib/rbac/catalog";
import { LocationAccessError, LocationValidationError, createMicrolot, exigeEditarBeneficioEnOrganizacion, updateLocationAttributes } from "../../lib/traceability/locations";
import { confirmarCoordenadasDelSitio } from "../../lib/traceability/coordenadasDelSitio";
import { actualizarBeneficio } from "../../lib/traceability/beneficios";
import { actualizarUbicacionDeSecado, crearUbicacionDeSecado, sitiosParaCrearInstalacion } from "../../lib/traceability/instalaciones";
import { EquipoError, informarCondicion, registrarEquipo, sitiosParaRegistrar } from "../../lib/equipos/equipos";

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
async function hijo(parentLocationId: string, locationType: "beneficio" | "plot" | "drying_facility" | "drying_bed") {
  return prisma.location.create({ data: { name: nombre(), locationType, classification: "internal", parentLocationId } });
}
async function cuenta(locationId: string, perfil: "Farm Manager" | "Farm Operator" | "Coffee Process Manager") {
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
async function conceder(userAccountId: string, resourceType = "location", action = "edit_beneficio") {
  const asignacion = await prisma.assignment.findFirstOrThrow({ where: { userAccountId } });
  const permiso = await prisma.permission.findFirstOrThrow({ where: { resourceType, action } });
  await prisma.assignmentPermissionOverride.create({
    data: { assignmentId: asignacion.id, permissionId: permiso.id, effect: "grant", reason: "TEST concesión de editar beneficio" },
  });
}
/** Cuenta Platform Admin propia, de ámbito de plataforma — el control positivo
 *  de las guardias sobre `exigeEditarBeneficioEnOrganizacion`. Se asigna sobre
 *  un Scope de plataforma YA EXISTENTE (no es único: la base compartida tiene
 *  muchos); nunca se crea ni se borra ese Scope, sólo esta cuenta. */
async function cuentaPlatformAdmin() {
  const personId = randomUUID();
  await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: "EditarBeneficio", displayName: personId } });
  personIds.push(personId);
  const userAccountId = randomUUID();
  await prisma.userAccount.create({ data: { id: userAccountId, personId, status: "active", authProvider: "credentials" } });
  accountIds.push(userAccountId);
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const scope = await prisma.scope.findFirstOrThrow({ where: { scopeType: "platform" } });
  await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
  return userAccountId;
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

  it("se rechaza también para una instalación de secado, para un Farm Manager", async () => {
    const finca = await sitio();
    const inst = await hijo(finca.id, "drying_facility");
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(createMicrolot(jefe, { parentLocationId: inst.id, name: nombre(), subdivisionReason: "other" }))
      .rejects.toThrow(new LocationValidationError("secado_no_se_subdivide"));
    // Control positivo: el mismo Farm Manager subdivide una parcela.
    const parc = await hijo(finca.id, "plot");
    const micro = await createMicrolot(jefe, { parentLocationId: parc.id, name: nombre(), subdivisionReason: "other" });
    expect(micro.locationType).toBe("plot");
  });
});

describe("instalaciones de secado por los caminos genéricos (updateLocationAttributes, confirmarCoordenadasDelSitio)", () => {
  it("un capataz NO edita atributos de una drying_facility por updateLocationAttributes; con la concesión, sí", async () => {
    const finca = await sitio();
    const inst = await hijo(finca.id, "drying_facility");
    const capataz = await cuenta(finca.id, "Farm Operator");
    await expect(updateLocationAttributes(capataz, { locationId: inst.id, description: "cambio" }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    // Control positivo: el mismo capataz SÍ edita una parcela del mismo sitio.
    const parc = await hijo(finca.id, "plot");
    await expect(updateLocationAttributes(capataz, { locationId: parc.id, description: "cambio" })).resolves.toBeDefined();
    await conceder(capataz);
    await expect(updateLocationAttributes(capataz, { locationId: inst.id, description: "cambio" })).resolves.toBeDefined();
  });

  it("un capataz NO mueve las coordenadas de una drying_facility por confirmarCoordenadasDelSitio; con la concesión, sí", async () => {
    const finca = await sitio();
    const inst = await hijo(finca.id, "drying_facility");
    const capataz = await cuenta(finca.id, "Farm Operator");
    await expect(confirmarCoordenadasDelSitio(capataz, { locationId: inst.id, latitude: 8.7, longitude: -82.4 }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    // Control positivo: el mismo capataz sigue declarando coordenadas de una parcela.
    const parc = await hijo(finca.id, "plot");
    await expect(confirmarCoordenadasDelSitio(capataz, { locationId: parc.id, latitude: 8.7, longitude: -82.4 })).resolves.toBeDefined();
    await conceder(capataz);
    await expect(confirmarCoordenadasDelSitio(capataz, { locationId: inst.id, latitude: 8.7, longitude: -82.4 })).resolves.toBeDefined();
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

describe("sitiosParaCrearInstalacion (Task 3, plan 3): sólo sitios donde además se puede editar el beneficio", () => {
  it("un capataz sin concesión no ve su sitio (lista vacía, no lanza); con la concesión, sí; un Farm Manager lo ve sin concesión", async () => {
    const finca = await sitio();
    const capataz = await cuenta(finca.id, "Farm Operator");
    const jefe = await cuenta(finca.id, "Farm Manager");

    // Control: `sitiosParaInstalaciones` SÍ ve el sitio (tiene manage_attributes
    // de perfil) — la resta la hace `puedeEditarBeneficioEn`, no la lectura de base.
    const { sitiosParaInstalaciones } = await import("../../lib/traceability/instalaciones");
    expect((await sitiosParaInstalaciones(capataz)).map((s) => s.id)).toContain(finca.id);

    expect(await sitiosParaCrearInstalacion(capataz)).toEqual([]);

    await conceder(capataz);
    expect((await sitiosParaCrearInstalacion(capataz)).map((s) => s.id)).toContain(finca.id);

    // Control positivo: el Farm Manager lo ve sin ninguna concesión.
    expect((await sitiosParaCrearInstalacion(jefe)).map((s) => s.id)).toContain(finca.id);
  });
});

describe("exigeEditarBeneficioEnOrganizacion (guardia compartida por las bandejas)", () => {
  const orgIds: string[] = [];
  afterEach(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    orgIds.length = 0;
  });

  it("una organización sin ninguna Location propia rechaza a un Farm Manager de otro sitio; un Platform Admin sí pasa", async () => {
    // El caso que forzó el respaldo de plataforma en
    // exigeEditarBeneficioEnOrganizacion: una organización con lotes pero SIN
    // ninguna Location — como las de las pruebas de recetas de antes de la
    // Parte 2a (recipeAuthoring.test.ts y recipeVersions.test.ts, ya retiradas)
    // — deja `lugares` vacío, así que el bucle nunca
    // corre `can()` ni una vez. Sin el respaldo, ni siquiera un Platform Admin
    // pasaría.
    const org = await prisma.organization.create({ data: { name: nombre(), organizationType: "farm" } });
    orgIds.push(org.id);
    const otroSitio = await sitio();
    const jefe = await cuenta(otroSitio.id, "Farm Manager");
    await expect(exigeEditarBeneficioEnOrganizacion(jefe, org.id)).rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    // Control positivo: el mismo camino, con un Platform Admin de ámbito de
    // plataforma.
    const admin = await cuentaPlatformAdmin();
    await expect(exigeEditarBeneficioEnOrganizacion(admin, org.id)).resolves.toBeUndefined();
  });

  it("una receta compartida (sin organización) no la configura un Farm Manager de finca", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(exigeEditarBeneficioEnOrganizacion(jefe, null)).rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    // Control positivo: el mismo camino, con un Platform Admin de ámbito de
    // plataforma.
    const admin = await cuentaPlatformAdmin();
    await expect(exigeEditarBeneficioEnOrganizacion(admin, null)).resolves.toBeUndefined();
  });

  /**
   * Hallazgo de la auditoría final de Codex: `resolveOrganizationForLocation`
   * (arriba, en este mismo archivo) trata la organización como heredable
   * subiendo por `parentLocationId`, pero esta guardia sólo miraba
   * `Location.organizationId = org` directamente — dejando fuera a cualquier
   * descendiente que la herede con el campo nulo. Medido el 2026-09-18: 8 de
   * 135 `Location` de la base de pruebas compartida están así.
   */
  it("un capataz asignado en una parcela con organización heredada (organizationId nulo) SÍ cuenta, con la concesión ahí", async () => {
    const org = await prisma.organization.create({ data: { name: nombre(), organizationType: "farm" } });
    orgIds.push(org.id);
    const finca = await prisma.location.create({ data: { name: nombre(), locationType: "site", classification: "internal", organizationId: org.id } });
    // `hijo()` nunca pasa `organizationId`: la parcela nace con el campo nulo
    // y hereda la de `finca` sólo por jerarquía, exactamente el caso medido.
    const parcela = await hijo(finca.id, "plot");
    const capataz = await cuenta(parcela.id, "Farm Operator");
    await expect(exigeEditarBeneficioEnOrganizacion(capataz, org.id)).rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    await conceder(capataz);
    await expect(exigeEditarBeneficioEnOrganizacion(capataz, org.id)).resolves.toBeUndefined();
  });
});

describe("equipos: la concesión de editar beneficio abre configurarlos (Daniel, 2026-09-18)", () => {
  const orgIds: string[] = [];
  const equipmentIds: string[] = [];
  const conditionReportIds: string[] = [];
  afterEach(async () => {
    await prisma.auditEvent.deleteMany({ where: { entityType: "equipment_condition_report", entityId: { in: conditionReportIds } } });
    await prisma.auditEvent.deleteMany({ where: { entityType: "equipment", entityId: { in: equipmentIds } } });
    // Borrar el equipo se lleva sus EquipmentTransfer y EquipmentConditionReport
    // (`onDelete: Cascade` en el esquema, sobre `equipmentId`).
    await prisma.equipment.deleteMany({ where: { id: { in: equipmentIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    orgIds.length = 0; equipmentIds.length = 0; conditionReportIds.length = 0;
  });

  async function organizacion() {
    const org = await prisma.organization.create({ data: { name: nombre(), organizationType: "farm" } });
    orgIds.push(org.id);
    return org;
  }

  it("un capataz sin concesión no registra un equipo en su finca; un Farm Manager sí", async () => {
    const org = await organizacion();
    const finca = await sitio();
    const capataz = await cuenta(finca.id, "Farm Operator");
    await expect(
      registrarEquipo(capataz, {
        name: nombre(),
        kind: "vessel",
        organizationId: org.id,
        provenanceClass: "original_record",
        initialLocationId: finca.id,
      }),
    ).rejects.toThrow(new EquipoError("forbidden"));
    // Control positivo: el mismo camino con un Farm Manager de la misma finca.
    const jefe = await cuenta(finca.id, "Farm Manager");
    const equipo = await registrarEquipo(jefe, {
      name: nombre(),
      kind: "vessel",
      organizationId: org.id,
      provenanceClass: "original_record",
      initialLocationId: finca.id,
    });
    equipmentIds.push(equipo.id);
  });

  it("el mismo capataz, con la concesión, sí lo registra", async () => {
    const org = await organizacion();
    const finca = await sitio();
    const capataz = await cuenta(finca.id, "Farm Operator");
    await conceder(capataz);
    const equipo = await registrarEquipo(capataz, {
      name: nombre(),
      kind: "vessel",
      organizationId: org.id,
      provenanceClass: "original_record",
      initialLocationId: finca.id,
    });
    equipmentIds.push(equipo.id);
    expect(equipo.name).toBeDefined();
  });

  it("operar sigue abierto: el capataz sin concesión informa la condición de un equipo que registró el Farm Manager", async () => {
    const org = await organizacion();
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const equipo = await registrarEquipo(jefe, {
      name: nombre(),
      kind: "vessel",
      organizationId: org.id,
      provenanceClass: "original_record",
      initialLocationId: finca.id,
    });
    equipmentIds.push(equipo.id);
    const informe = await informarCondicion(capataz, {
      equipmentId: equipo.id,
      condition: "operational",
      occurredAt: new Date(),
    });
    conditionReportIds.push(informe.id);
    expect(informe.condition).toBe("operational");
  });

  // Fix round 1: `sitiosParaRegistrar` alimenta tanto el selector de
  // `app/equipos/nuevo/page.tsx` como la re-validación de
  // `registrarEquipoFormAction` (app/actions/equipos.ts, `sitio_no_gestionable`
  // si el sitio elegido no aparece en esta lista). Usaba `can(..., "manage", ...)`
  // a secas: un capataz con la concesión pasaba `registrarEquipo` pero nunca
  // veía su propia finca en la lista, y el formulario la rechazaba igual.
  it("sitiosParaRegistrar: el capataz sin concesión no ve su finca; con la concesión, sí; control: el Farm Manager la ve", async () => {
    const org = await organizacion();
    const finca = await prisma.location.create({
      data: { name: nombre(), locationType: "site", classification: "internal", organizationId: org.id },
    });
    const capataz = await cuenta(finca.id, "Farm Operator");
    const jefe = await cuenta(finca.id, "Farm Manager");

    const sinConcesion = await sitiosParaRegistrar(capataz);
    expect(sinConcesion.map((s) => s.id)).not.toContain(finca.id);

    await conceder(capataz);
    const conConcesion = await sitiosParaRegistrar(capataz);
    expect(conConcesion.map((s) => s.id)).toContain(finca.id);

    // Control positivo: el Farm Manager de esa misma finca la ve sin concesión.
    const delJefe = await sitiosParaRegistrar(jefe);
    expect(delJefe.map((s) => s.id)).toContain(finca.id);
  });
});
