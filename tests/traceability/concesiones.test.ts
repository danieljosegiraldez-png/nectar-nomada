import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { Prisma } from "../../generated/prisma/client";
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
  reintentarUnaVezAnteConflicto,
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

  /**
   * Hallazgo 1 (revisión independiente de Codex, 2026-09-18): la guardia de
   * entrada sólo comprobaba autoridad del actor SOBRE EL BENEFICIO, pero la
   * fila que se toca es el override de la asignación RECEPTORA, cuyo ámbito
   * puede ser un ancestro más ancho (todo el sitio). Un Farm Manager cuya
   * única asignación cuelga DEL BENEFICIO pasaba `exigeBeneficioEditable` y
   * podía conceder sobre una asignación de sitio entero — más autoridad de la
   * que él mismo tiene.
   */
  it("un actor con autoridad SÓLO sobre el beneficio no puede conceder a una asignación de ámbito más ancho (el sitio)", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    // Nota del ticket: un Farm Manager asignado en el beneficio necesita un
    // Scope para esa ubicación — cuenta() lo crea si no existe.
    const jefeDelBeneficio = await cuenta(ben.id, "Farm Manager");
    const capatazDelSitio = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capatazDelSitio);

    await expect(concederEditarBeneficio(jefeDelBeneficio, { beneficioId: ben.id, assignmentId, reason: "razón" }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));

    // Control positivo: un Farm Manager DEL SITIO (autoridad que sí alcanza el
    // ámbito de la asignación receptora) puede conceder sobre esa misma fila.
    const jefeDelSitio = await cuenta(finca.id, "Farm Manager");
    const resultado = await concederEditarBeneficio(jefeDelSitio, { beneficioId: ben.id, assignmentId, reason: "razón" });
    expect(resultado).toBeDefined();
  });

  /**
   * Hallazgo 3, ruling del controlador: re-conceder sobre una concesión ya
   * existente sólo actualiza la razón — el `createdBy` original (quién la
   * concedió primero) no se sobrescribe con quien la renueva.
   */
  it("re-conceder sobre una concesión ya existente actualiza sólo la razón, no el createdBy original", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const jefe1 = await cuenta(finca.id, "Farm Manager");
    const jefe2 = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capataz);

    const primera = await concederEditarBeneficio(jefe1, { beneficioId: ben.id, assignmentId, reason: "primera razón" });
    expect(primera.createdBy).toBe(jefe1);

    const segunda = await concederEditarBeneficio(jefe2, { beneficioId: ben.id, assignmentId, reason: "segunda razón" });
    expect(segunda.id).toBe(primera.id);
    expect(segunda.createdBy).toBe(jefe1);
    expect(segunda.reason).toBe("segunda razón");
  });

  /**
   * Hallazgo 4: el `AuditEvent` lleva el contexto desde el que se autorizó —
   * el beneficio y el ámbito de la asignación receptora — tanto para conceder
   * como para quitar.
   */
  it("el AuditEvent lleva el contexto: beneficioId y el ámbito de la asignación receptora", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capataz);
    const fila = await concederEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId, reason: "razón" });

    const evento = await prisma.auditEvent.findFirstOrThrow({
      where: { operation: "beneficio.conceder_edicion", entityType: "assignment_permission_override", entityId: fila.id },
    });
    const after = evento.after as { contexto?: { beneficioId?: string; ambitoLocationId?: string } };
    expect(after.contexto?.beneficioId).toBe(ben.id);
    expect(after.contexto?.ambitoLocationId).toBe(finca.id);

    await quitarEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId });
    const eventoQuitar = await prisma.auditEvent.findFirstOrThrow({
      where: { operation: "beneficio.quitar_edicion", entityType: "assignment_permission_override", entityId: fila.id },
    });
    const before = eventoQuitar.before as { contexto?: { beneficioId?: string; ambitoLocationId?: string } };
    expect(before.contexto?.beneficioId).toBe(ben.id);
    expect(before.contexto?.ambitoLocationId).toBe(finca.id);
  });

  /**
   * Hallazgo 6: el criterio de "asignación activa" no es sólo `status ===
   * "active"` — el resolutor (lib/rbac/service.ts, getResolvedAssignments)
   * también exige estar dentro de la ventana [validFrom, validTo). Antes del
   * fix, una asignación con `status: "active"` pero fuera de su ventana
   * pasaba `asignacionQueAlcanza` igual.
   */
  describe("hallazgo 6: la ventana de validez, no sólo status", () => {
    it("validTo en el pasado: asignacion_fuera_de_ambito, y ausente de personasDelBeneficio", async () => {
      const finca = await sitio();
      const ben = await beneficio(finca.id);
      const jefe = await cuenta(finca.id, "Farm Manager");
      const capataz = await cuenta(finca.id, "Farm Operator");
      const assignmentId = await idDeLaAsignacion(capataz);
      await prisma.assignment.update({ where: { id: assignmentId }, data: { validTo: new Date(Date.now() - 60_000) } });

      await expect(concederEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId, reason: "razón" }))
        .rejects.toThrow(new ConcesionError("asignacion_fuera_de_ambito"));

      const personas = await personasDelBeneficio(jefe, ben.id);
      expect(personas.find((p) => p.assignmentId === assignmentId)).toBeUndefined();
    });

    it("validFrom en el futuro: asignacion_fuera_de_ambito, y ausente de personasDelBeneficio", async () => {
      const finca = await sitio();
      const ben = await beneficio(finca.id);
      const jefe = await cuenta(finca.id, "Farm Manager");
      const capataz = await cuenta(finca.id, "Farm Operator");
      const assignmentId = await idDeLaAsignacion(capataz);
      await prisma.assignment.update({ where: { id: assignmentId }, data: { validFrom: new Date(Date.now() + 86_400_000) } });

      await expect(concederEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId, reason: "razón" }))
        .rejects.toThrow(new ConcesionError("asignacion_fuera_de_ambito"));

      const personas = await personasDelBeneficio(jefe, ben.id);
      expect(personas.find((p) => p.assignmentId === assignmentId)).toBeUndefined();
    });
  });

  /**
   * Hallazgo 2: la escritura del `grant` es CONDICIONAL (el `WHERE` exige
   * `effect: "grant"`), no un `upsert` incondicional. Esto es una prueba
   * DETERMINISTA de la condición SQL en sí — no simula la concurrencia real
   * (dos transacciones solapadas), que el informe final documenta aparte como
   * argumentada y no probada. Prueba que la fila con `effect: "deny"` NO
   * puede ser tocada por el mismo `UPDATE ... WHERE effect = 'grant'` que
   * `concederEditarBeneficio` ejecuta dentro de su transacción.
   */
  describe("hallazgo 2: la escritura del grant es condicional", () => {
    it("el UPDATE con guardia effect:'grant' no toca una fila con effect:'deny'", async () => {
      const finca = await sitio();
      const capataz = await cuenta(finca.id, "Farm Operator");
      const assignmentId = await idDeLaAsignacion(capataz);
      await ponerDeny(capataz);
      const permiso = await prisma.permission.findFirstOrThrow({ where: { resourceType: "location", action: "edit_beneficio" } });

      const actualizados = await prisma.assignmentPermissionOverride.updateMany({
        where: { assignmentId, permissionId: permiso.id, effect: "grant" },
        data: { reason: "intento de pisar el deny" },
      });
      expect(actualizados.count).toBe(0);

      const fila = await prisma.assignmentPermissionOverride.findUniqueOrThrow({
        where: { assignmentId_permissionId: { assignmentId, permissionId: permiso.id } },
      });
      expect(fila.effect).toBe("deny");
      expect(fila.reason).toBeNull();
    });
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

  /** Hallazgo 1, lado de quitar: la misma escalada de ámbito, en revocar. */
  it("un actor con autoridad SÓLO sobre el beneficio no puede quitar una concesión de una asignación de ámbito más ancho (el sitio)", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const jefeDelSitio = await cuenta(finca.id, "Farm Manager");
    const capatazDelSitio = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capatazDelSitio);
    await concederEditarBeneficio(jefeDelSitio, { beneficioId: ben.id, assignmentId, reason: "razón" });

    const jefeDelBeneficio = await cuenta(ben.id, "Farm Manager");
    await expect(quitarEditarBeneficio(jefeDelBeneficio, { beneficioId: ben.id, assignmentId }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));

    // Control positivo: el jefe del sitio sí puede quitarla.
    await quitarEditarBeneficio(jefeDelSitio, { beneficioId: ben.id, assignmentId });
    await expect(exigeEditarBeneficioEn(capatazDelSitio, ben.id)).rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
  });

  /**
   * Ruling 3 (finding 3): quitar puede borrar CUALQUIER `grant` de este
   * permiso dentro del ámbito de autoridad del actor — incluso uno que puso
   * la administración (Platform Admin), no sólo uno puesto por esta misma
   * delegación. No hay columnas de procedencia que lo distingan.
   */
  it("quitar borra un grant aunque lo haya puesto otra persona (p. ej. administración), no sólo el de esta delegación", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const jefe = await cuenta(finca.id, "Farm Manager");
    const admin = await cuenta(finca.id, "Farm Manager"); // hace de "otra persona" que concedió
    const capataz = await cuenta(finca.id, "Farm Operator");
    const assignmentId = await idDeLaAsignacion(capataz);

    // "admin" concede, no "jefe" — el grant existente no es de quien va a quitarlo.
    const fila = await concederEditarBeneficio(admin, { beneficioId: ben.id, assignmentId, reason: "puesta por otra persona" });
    expect(fila.createdBy).toBe(admin);

    await quitarEditarBeneficio(jefe, { beneficioId: ben.id, assignmentId });
    await expect(exigeEditarBeneficioEn(capataz, ben.id)).rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
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

/**
 * Ronda 2 de la revisión independiente de Codex (2026-09-18), hallazgo A.
 *
 * `reintentarUnaVezAnteConflicto` es la parte de la corrección que SÍ se
 * puede probar de forma determinista, sin base de datos: es una función
 * genérica que recibe una operación de mentira. La otra mitad —una carrera
 * real de dos transacciones de Postgres solapadas— está argumentada, no
 * reproducida aquí; ver el informe final.
 */
function errorDeConcurrencia(code: "P2002" | "P2034"): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`fingido: ${code}`, { code, clientVersion: "test" });
}

describe("reintentarUnaVezAnteConflicto", () => {
  it("P2002 una vez y éxito la segunda: la operación se llama DOS veces y devuelve el resultado del segundo intento", async () => {
    let llamadas = 0;
    const resultado = await reintentarUnaVezAnteConflicto(async () => {
      llamadas += 1;
      if (llamadas === 1) throw errorDeConcurrencia("P2002");
      return "segundo intento";
    });
    expect(llamadas).toBe(2);
    expect(resultado).toBe("segundo intento");
  });

  it("P2034 una vez y éxito la segunda: mismo comportamiento que P2002 (los dos son 'conflicto de concurrencia')", async () => {
    let llamadas = 0;
    const resultado = await reintentarUnaVezAnteConflicto(async () => {
      llamadas += 1;
      if (llamadas === 1) throw errorDeConcurrencia("P2034");
      return "ok";
    });
    expect(llamadas).toBe(2);
    expect(resultado).toBe("ok");
  });

  it("choca las DOS veces: ConcesionError('conflicto_concurrente'), llamada exactamente dos veces (no reintenta indefinidamente)", async () => {
    let llamadas = 0;
    await expect(
      reintentarUnaVezAnteConflicto(async () => {
        llamadas += 1;
        throw errorDeConcurrencia("P2002");
      }),
    ).rejects.toThrow(new ConcesionError("conflicto_concurrente"));
    expect(llamadas).toBe(2);
  });

  it("un error que NO es de concurrencia se relanza tal cual, sin reintentar", async () => {
    let llamadas = 0;
    const otroError = new Error("esto no es un conflicto de concurrencia");
    await expect(
      reintentarUnaVezAnteConflicto(async () => {
        llamadas += 1;
        throw otroError;
      }),
    ).rejects.toThrow(otroError);
    expect(llamadas).toBe(1);
  });

  it("sin ningún error: se llama UNA sola vez", async () => {
    let llamadas = 0;
    const resultado = await reintentarUnaVezAnteConflicto(async () => {
      llamadas += 1;
      return "directo";
    });
    expect(llamadas).toBe(1);
    expect(resultado).toBe("directo");
  });
});

/**
 * Ronda 2, hallazgo B: `personasDelBeneficio` listaba asignaciones de ámbito
 * ancestro (el sitio) sin comprobar si EL ACTOR tiene autoridad sobre ese
 * ámbito — la misma guardia que el hallazgo 1 le exige a
 * `concederEditarBeneficio`/`quitarEditarBeneficio`. Sin `puedeGestionar`, la
 * pantalla ofrecía un formulario que el servidor iba a rechazar.
 */
describe("personasDelBeneficio: puedeGestionar (hallazgo B, ronda 2)", () => {
  it("un Farm Manager DEL BENEFICIO ve a un capataz DEL SITIO con puedeGestionar: false; un Farm Manager DEL SITIO lo ve true", async () => {
    const finca = await sitio();
    const ben = await beneficio(finca.id);
    const jefeDelBeneficio = await cuenta(ben.id, "Farm Manager");
    const jefeDelSitio = await cuenta(finca.id, "Farm Manager");
    const capatazDelSitio = await cuenta(finca.id, "Farm Operator");
    const assignmentIdCapataz = await idDeLaAsignacion(capatazDelSitio);

    const paraJefeDelBeneficio = await personasDelBeneficio(jefeDelBeneficio, ben.id);
    const filaCapataz = paraJefeDelBeneficio.find((p) => p.assignmentId === assignmentIdCapataz);
    expect(filaCapataz?.puedeGestionar).toBe(false);

    const paraJefeDelSitio = await personasDelBeneficio(jefeDelSitio, ben.id);
    const filaCapatazDesdeElSitio = paraJefeDelSitio.find((p) => p.assignmentId === assignmentIdCapataz);
    expect(filaCapatazDesdeElSitio?.puedeGestionar).toBe(true);
  });
});
