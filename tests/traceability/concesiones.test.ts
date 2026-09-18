import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  LocationAccessError,
  exigeEditarBeneficioEn,
  puedeEditarBeneficioEn,
  puedeEditarBeneficioEnOrganizacion,
} from "../../lib/traceability/locations";
import { listarBeneficios } from "../../lib/traceability/beneficios";
import {
  ConcesionError,
  personasDelBeneficio,
  concederEditarBeneficio as concederEditarBeneficioRaw,
  quitarEditarBeneficio as quitarEditarBeneficioRaw,
} from "../../lib/traceability/concesiones";

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

/**
 * Fix round 1 (hallazgo de revisión): `quitarEditarBeneficio` BORRA el
 * override, así que si el `afterEach` busca los overrides a limpiar
 * RE-CONSULTANDO la tabla al final del test, el override que ya se quitó no
 * aparece — y su `AuditEvent` (`beneficio.conceder_edicion` y
 * `beneficio.quitar_edicion`, con `entityId` = el id de ESE override) se queda
 * sin nadie que lo borre. `overridesAuditados` graba el id EN EL MOMENTO en que
 * la fila existe (el valor de retorno de `concederEditarBeneficio`, que es el
 * mismo id que `quitarEditarBeneficio` borra después), así que el `afterEach`
 * no depende de que la fila siga viva para saber qué `AuditEvent` limpiar.
 */
const overridesAuditados: string[] = [];
async function concederEditarBeneficio(actorId: string, input: Parameters<typeof concederEditarBeneficioRaw>[1]) {
  const fila = await concederEditarBeneficioRaw(actorId, input);
  overridesAuditados.push(fila.id);
  return fila;
}
async function quitarEditarBeneficio(actorId: string, input: Parameters<typeof quitarEditarBeneficioRaw>[1]) {
  return quitarEditarBeneficioRaw(actorId, input);
}

afterEach(async () => {
  const asignaciones = await prisma.assignment.findMany({ where: { userAccountId: { in: accountIds } }, select: { id: true } });
  const asignacionIds = asignaciones.map((a) => a.id);
  const overrides = await prisma.assignmentPermissionOverride.findMany({ where: { assignmentId: { in: asignacionIds } }, select: { id: true } });
  // Unión de lo que sigue vivo (overrides sin quitar, p. ej. un `deny`) con lo
  // que se auditó y pudo haberse borrado ya (un `grant` quitado por
  // `quitarEditarBeneficio` dentro del propio test).
  const overrideIds = [...new Set([...overrides.map((o) => o.id), ...overridesAuditados])];
  await prisma.auditEvent.deleteMany({ where: { entityType: "assignment_permission_override", entityId: { in: overrideIds } } });
  await prisma.assignmentPermissionOverride.deleteMany({ where: { assignmentId: { in: asignacionIds } } });
  await prisma.assignment.deleteMany({ where: { id: { in: asignacionIds } } });
  await prisma.scope.deleteMany({ where: { id: { in: scopeIds } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });

  const rows = await prisma.location.findMany({ where: { name: { in: names } }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  await prisma.location.deleteMany({ where: { parentLocationId: { in: ids } } });
  await prisma.location.deleteMany({ where: { id: { in: ids } } });

  names.length = 0; accountIds.length = 0; personIds.length = 0; scopeIds.length = 0; overridesAuditados.length = 0;
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
    const override = await concederEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId, reason: "temporal" });
    await expect(exigeEditarBeneficioEn(capataz, ben.id)).resolves.toBeUndefined();

    await quitarEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId });

    await expect(exigeEditarBeneficioEn(capataz, ben.id)).rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    const evento = await prisma.auditEvent.findFirst({ where: { operation: "beneficio.quitar_edicion", entityType: "assignment_permission_override" } });
    expect(evento).not.toBeNull();

    // Control positivo (fix round 1): el override YA está borrado aquí
    // (`quitarEditarBeneficio` lo borró arriba), y la cuenta de sus dos
    // AuditEvent —conceder y quitar— por `entityId` SÍ los encuentra, ANTES
    // de que el `afterEach` limpie nada. Sin este control, un `entityId` mal
    // escrito o un `where` vacío pasarían con el mismo "not.toBeNull()" de
    // arriba sin que nadie lo notara.
    const eventosDeEsteOverride = await prisma.auditEvent.count({
      where: {
        entityType: "assignment_permission_override",
        entityId: override.id,
        operation: { in: ["beneficio.conceder_edicion", "beneficio.quitar_edicion"] },
      },
    });
    expect(eventosDeEsteOverride).toBe(2);
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

/**
 * Plan 3, Task 2 — los booleanos que envuelven las mismas guardias del
 * servidor, para que una pantalla pueda preguntar sin duplicar la regla.
 */
describe("puedeEditarBeneficioEn", () => {
  it("true para Farm Manager (de serie), false para un capataz, true con concesión", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capataz);

    expect(await puedeEditarBeneficioEn(jefe, ben.id)).toBe(true);
    expect(await puedeEditarBeneficioEn(capataz, ben.id)).toBe(false);

    await concederEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId, reason: "cubre la temporada" });
    expect(await puedeEditarBeneficioEn(capataz, ben.id)).toBe(true);
  });

  it("relanza cualquier otro error: una ubicación que no existe no es 'false'", async () => {
    await expect(puedeEditarBeneficioEn(randomUUID(), randomUUID())).rejects.toThrow(
      new LocationAccessError("location_not_found"),
    );
  });
});

describe("puedeEditarBeneficioEnOrganizacion", () => {
  const orgIds: string[] = [];
  afterEach(async () => {
    await prisma.location.updateMany({ where: { organizationId: { in: orgIds } }, data: { organizationId: null } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    orgIds.length = 0;
  });

  it("true para Farm Manager (de serie), false para un capataz, true con concesión", async () => {
    const org = await prisma.organization.create({ data: { name: nombre(), organizationType: "farm" } });
    orgIds.push(org.id);
    const finca = await prisma.location.create({
      data: { name: nombre(), locationType: "site", classification: "internal", organizationId: org.id },
    });
    names.push(finca.name);
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capataz);

    expect(await puedeEditarBeneficioEnOrganizacion(jefe, org.id)).toBe(true);
    expect(await puedeEditarBeneficioEnOrganizacion(capataz, org.id)).toBe(false);

    const ben = await beneficio(finca.id);
    await concederEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId, reason: "cubre la temporada" });
    expect(await puedeEditarBeneficioEnOrganizacion(capataz, org.id)).toBe(true);
  });
});

describe("listarBeneficios: puedeEditar", () => {
  it("el capataz lo ve con puedeEditar: false; con concesión, true", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capataz);

    const antes = await listarBeneficios(capataz);
    const filaAntes = antes.find((b) => b.id === ben.id);
    expect(filaAntes?.puedeEditar).toBe(false);

    await concederEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId, reason: "cubre la temporada" });

    const despues = await listarBeneficios(capataz);
    const filaDespues = despues.find((b) => b.id === ben.id);
    expect(filaDespues?.puedeEditar).toBe(true);

    // Control positivo: el Farm Manager lo ve editable de serie, sin concesión.
    const paraJefe = await listarBeneficios(jefe);
    expect(paraJefe.find((b) => b.id === ben.id)?.puedeEditar).toBe(true);
  });
});
