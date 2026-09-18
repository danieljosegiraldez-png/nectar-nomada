import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { LocationAccessError, exigeEditarBeneficioEn } from "../../lib/traceability/locations";
import { ConcesionError, concederEditarBeneficio, personasDelBeneficio, quitarEditarBeneficio } from "../../lib/traceability/concesiones";

/**
 * Plan 3, Task 1 — la delegación estrecha: sólo `location:edit_beneficio`,
 * sólo sobre asignaciones cuyo ámbito alcanza el beneficio, con razón
 * obligatoria y `AuditEvent` en la misma transacción. Fixtures con el mismo
 * estilo que `tests/traceability/editarBeneficio.test.ts`.
 */

const names: string[] = [];
const accountIds: string[] = [];
const personIds: string[] = [];
const scopeIds: string[] = [];
function nombre() { const n = `TEST-CONC-${randomUUID()}`; names.push(n); return n; }

async function sitio() {
  return prisma.location.create({ data: { name: nombre(), locationType: "site", classification: "internal" } });
}
async function beneficio(sitioId: string) {
  return prisma.location.create({ data: { name: nombre(), locationType: "beneficio", classification: "internal", parentLocationId: sitioId } });
}
async function cuenta(locationId: string, perfil: "Farm Manager" | "Farm Operator") {
  const personId = randomUUID();
  await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: "Concesiones", displayName: personId } });
  personIds.push(personId);
  const userAccountId = randomUUID();
  await prisma.userAccount.create({ data: { id: userAccountId, personId, status: "active", authProvider: "credentials" } });
  accountIds.push(userAccountId);
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
  const scope = existente ?? (await prisma.scope.create({ data: { id: randomUUID(), scopeType: "location", scopeRefId: locationId } }));
  if (!existente) scopeIds.push(scope.id);
  await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
  return userAccountId;
}
async function idDeLaAsignacion(userAccountId: string) {
  return (await prisma.assignment.findFirstOrThrow({ where: { userAccountId } })).id;
}
async function ponerDeny(userAccountId: string) {
  const asignacion = await prisma.assignment.findFirstOrThrow({ where: { userAccountId } });
  const permiso = await prisma.permission.findFirstOrThrow({ where: { resourceType: "location", action: "edit_beneficio" } });
  await prisma.assignmentPermissionOverride.create({
    data: { assignmentId: asignacion.id, permissionId: permiso.id, effect: "deny", createdBy: userAccountId, reason: null },
  });
}

afterEach(async () => {
  const asignaciones = await prisma.assignment.findMany({ where: { userAccountId: { in: accountIds } }, select: { id: true } });
  const asignacionIds = asignaciones.map((a) => a.id);
  const overrides = await prisma.assignmentPermissionOverride.findMany({ where: { assignmentId: { in: asignacionIds } }, select: { id: true } });
  const overrideIds = overrides.map((o) => o.id);
  await prisma.auditEvent.deleteMany({ where: { entityType: "assignment_permission_override", entityId: { in: overrideIds } } });
  await prisma.assignmentPermissionOverride.deleteMany({ where: { id: { in: overrideIds } } });
  await prisma.assignment.deleteMany({ where: { id: { in: asignacionIds } } });
  await prisma.scope.deleteMany({ where: { id: { in: scopeIds } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });

  const rows = await prisma.location.findMany({ where: { name: { in: names } }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  await prisma.location.deleteMany({ where: { parentLocationId: { in: ids } } });
  await prisma.location.deleteMany({ where: { id: { in: ids } } });

  names.length = 0; accountIds.length = 0; personIds.length = 0; scopeIds.length = 0;
});

describe("concederEditarBeneficio", () => {
  it("un Farm Manager de la finca concede a un capataz de la finca con razón: AuditEvent y acceso nuevo", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capataz);

    // Control: antes de conceder, el capataz no pasa la guardia del servidor.
    await expect(exigeEditarBeneficioEn(capataz, ben.id)).rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));

    const resultado = await concederEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId, reason: "cubre la temporada" });
    expect(resultado).toBeDefined();

    await expect(exigeEditarBeneficioEn(capataz, ben.id)).resolves.toBeUndefined();

    const evento = await prisma.auditEvent.findFirst({ where: { operation: "beneficio.conceder_edicion", entityType: "assignment_permission_override" } });
    expect(evento).not.toBeNull();
  });

  it("sin razón: razon_obligatoria y no queda override", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capataz);

    await expect(concederEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId, reason: "   " }))
      .rejects.toThrow(new ConcesionError("razon_obligatoria"));

    const override = await prisma.assignmentPermissionOverride.findUnique({
      where: { assignmentId_permissionId: { assignmentId, permissionId: (await prisma.permission.findFirstOrThrow({ where: { resourceType: "location", action: "edit_beneficio" } })).id } },
    });
    expect(override).toBeNull();
  });

  it("un capataz NO puede conceder (a otro capataz)", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const capataz1 = await cuenta(finca.id, "Farm Operator");
    const capataz2 = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capataz2);

    await expect(concederEditarBeneficio(capataz1, { beneficioId: ben.id, assignmentId, reason: "razón" }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
  });

  it("a una asignación de otra finca: asignacion_fuera_de_ambito", async () => {
    const finca1 = await sitio();
    const finca2 = await sitio();
    const ben = await beneficio(finca1.id);
    const jefe = await cuenta(finca1.id, "Farm Manager");
    const capatazDeOtraFinca = await cuenta(finca2.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capatazDeOtraFinca);

    await expect(concederEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId, reason: "razón" }))
      .rejects.toThrow(new ConcesionError("asignacion_fuera_de_ambito"));
  });

  it("a un Farm Manager (de serie): ya_lo_tiene", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const jefe = await cuenta(finca.id, "Farm Manager");
    const otroJefe = await cuenta(finca.id, "Farm Manager");
    const assignmentId = await idDeLaAsignacion(otroJefe);

    await expect(concederEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId, reason: "razón" }))
      .rejects.toThrow(new ConcesionError("ya_lo_tiene"));
  });

  it("con un deny de administración ya puesto: quitado_por_administracion, y el deny sigue ahí", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capataz);
    await ponerDeny(capataz);

    await expect(concederEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId, reason: "razón" }))
      .rejects.toThrow(new ConcesionError("quitado_por_administracion"));

    const permiso = await prisma.permission.findFirstOrThrow({ where: { resourceType: "location", action: "edit_beneficio" } });
    const deny = await prisma.assignmentPermissionOverride.findUnique({
      where: { assignmentId_permissionId: { assignmentId, permissionId: permiso.id } },
    });
    expect(deny?.effect).toBe("deny");
  });

  it("a una ubicación que no es beneficio: no_es_beneficio", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capataz);

    // finca.id es un "site", no un "beneficio" — pero el Farm Manager SÍ pasa
    // exigeEditarBeneficioEn ahí (edit_beneficio de serie), así que la guardia
    // que debe frenar esto es no_es_beneficio, no LocationAccessError.
    await expect(concederEditarBeneficio(jefe, { beneficioId: finca.id, assignmentId, reason: "razón" }))
      .rejects.toThrow(new ConcesionError("no_es_beneficio"));
  });
});

describe("quitarEditarBeneficio", () => {
  it("quita una concesión: el capataz vuelve a ser rechazado y hay AuditEvent beneficio.quitar_edicion", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capataz);
    await concederEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId, reason: "temporal" });
    await expect(exigeEditarBeneficioEn(capataz, ben.id)).resolves.toBeUndefined();

    await quitarEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId });

    await expect(exigeEditarBeneficioEn(capataz, ben.id)).rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    const evento = await prisma.auditEvent.findFirst({ where: { operation: "beneficio.quitar_edicion", entityType: "assignment_permission_override" } });
    expect(evento).not.toBeNull();
  });

  it("quitar sin concesión: sin_concesion", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capataz);

    await expect(quitarEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId }))
      .rejects.toThrow(new ConcesionError("sin_concesion"));
  });
});

describe("personasDelBeneficio", () => {
  it("lista los estados correctos, y un Farm Manager de otra finca no lo puede leer", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const assignmentIdCapataz = await idDeLaAsignacion(capataz);

    const antes = await personasDelBeneficio(jefe, ben.id);
    const filaCapatazAntes = antes.find((p) => p.assignmentId === assignmentIdCapataz);
    expect(filaCapatazAntes?.estado).toBe("sin_permiso");
    const filaJefeAntes = antes.find((p) => p.assignmentId !== assignmentIdCapataz);
    expect(filaJefeAntes?.estado).toBe("de_serie");

    await concederEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId: assignmentIdCapataz, reason: "cubre la temporada" });

    const despues = await personasDelBeneficio(jefe, ben.id);
    const filaCapatazDespues = despues.find((p) => p.assignmentId === assignmentIdCapataz);
    expect(filaCapatazDespues?.estado).toBe("concedido");
    expect(filaCapatazDespues?.razon).toBe("cubre la temporada");
    expect(filaCapatazDespues?.ambito).toBe(finca.name);

    const finca2 = await sitio();
    const jefeDeOtraFinca = await cuenta(finca2.id, "Farm Manager");
    await expect(personasDelBeneficio(jefeDeOtraFinca, ben.id)).rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
  });
});
