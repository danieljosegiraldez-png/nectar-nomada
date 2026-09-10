/**
 * A9.12 (D10b) — el emisor de bitácora.
 *
 * Dos mitades. Las reglas de «lo inmediato» se prueban sobre la función pura,
 * porque construir una visita entera por cada regla convierte el test en algo
 * que nadie vuelve a tocar. El cierre se prueba una vez de punta a punta contra
 * Postgres, que es lo único que puede afirmar que el emisor lee el rastro real
 * y no una lista que yo escribí.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createColony, createHive } from "../../lib/apiary/hives";
import { recordInspection } from "../../lib/apiary/inspections";
import { recordColonyEvent } from "../../lib/apiary/colonyEvents";
import { completarVisita, startFieldSession } from "../../lib/traceability/fieldSessions";
import { REGLAS_INMEDIATAS, inmediatosDe, resumenDeVisita } from "../../lib/apiary/bitacora";
import { DestinoEnMemoria, destinoDeBitacora } from "../../lib/integrations/bitacora";
import type { Enmienda } from "../../lib/traceability/enmiendas";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a912-bit-${Date.now()}`;

function enmienda(parcial: Partial<Enmienda>): Enmienda {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    occurredAt: new Date("2026-09-08T12:00:00Z"),
    operation: "inspection.create",
    entityType: "inspection",
    entityId: "x",
    reason: null,
    sourceInterface: "apiary.service",
    before: null,
    after: null,
    ...parcial,
  };
}

describe("A9.12 — las reglas de lo inmediato", () => {
  const enlace = () => "/apiaries/sitio";

  it("una inspección SIN problema no interrumpe — el control positivo de todo lo demás", () => {
    const e = enmienda({ operation: "inspection.create", after: { outcome: "nothing_unusual" } });
    expect(inmediatosDe([e], enlace)).toEqual([]);
  });

  it("una inspección CON problema sí", () => {
    const e = enmienda({ operation: "inspection.create", after: { outcome: "issue_observed" } });
    const m = inmediatosDe([e], enlace);
    expect(m).toHaveLength(1);
    expect(m[0]!.clase).toBe("inmediato");
  });

  it("un tratamiento interrumpe; una alimentación no", () => {
    const tratamiento = enmienda({
      operation: "colony_event.create",
      after: { eventType: "treatment", treatmentProduct: "Apivar" },
    });
    const alimento = enmienda({ operation: "colony_event.create", after: { eventType: "feeding" } });
    expect(inmediatosDe([tratamiento], enlace)).toHaveLength(1);
    expect(inmediatosDe([alimento], enlace)).toEqual([]);
    // El producto entra en el texto porque quien cosecha necesita saber cuál.
    expect(inmediatosDe([tratamiento], enlace)[0]!.texto).toContain("Apivar");
  });

  it("el mensaje lleva ENLACE y cifras, nunca el contenido del registro", () => {
    // La razón es de seguridad: llega a un teléfono, y RBAC no interviene en esa
    // pantalla. El enlace sí vuelve a pasar por la compuerta al abrirse.
    const e = enmienda({
      operation: "inspection.create",
      after: { outcome: "issue_observed", note: "SECRETO QUE NO DEBE VIAJAR", broodPatternNote: "tampoco esto" },
    });
    const m = inmediatosDe([e], enlace)[0]!;
    expect(m.enlace).toBe("/apiaries/sitio");
    expect(m.texto).not.toContain("SECRETO");
    expect(m.texto).not.toContain("tampoco esto");
    expect(JSON.stringify(m)).not.toContain("SECRETO");
  });

  it("la clave sale del registro, no del reloj: reintentar no duplica", () => {
    const e = enmienda({ operation: "inspection.create", after: { outcome: "issue_observed" } });
    const a = inmediatosDe([e], enlace)[0]!;
    const b = inmediatosDe([e], enlace)[0]!;
    expect(a.clave).toBe(b.clave);
    expect(a.clave).toContain(e.id);
  });

  it("cada regla declara su razón — no es un umbral suelto", () => {
    expect(REGLAS_INMEDIATAS.length).toBeGreaterThan(0);
    for (const r of REGLAS_INMEDIATAS) {
      expect(r.razon.length, `la regla ${r.operation} no dice por qué interrumpe`).toBeGreaterThan(40);
    }
  });
});

describe("A9.12 — el cierre emite, leyendo el rastro real", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let personId: string;
  let colonyId: string;

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = organization.id;

    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Bitacora", displayName: `TEST Bitacora (${RUN_ID})`, locale: "es" },
    });
    personId = person.id;
    const cuenta = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    userAccountId = cuenta.id;

    const project = await prisma.project.create({
      data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    projectId = project.id;

    const location = await prisma.location.create({
      data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    });
    locationId = location.id;

    const farmOperator = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperator.id, scopeId: scope.id } });

    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `B-${RUN_ID.slice(-4)}` });
    const colony = await createColony(userAccountId, {
      hiveId: hive.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });
    colonyId = colony.id;
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: userAccountId }) });
    await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSession: { locationId } }) });
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId }) });
    await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: colonyId }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    // Assignment.scopeId es RESTRICT: el Scope sólo se puede borrar después.
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  beforeEach(() => {
    (destinoDeBitacora as DestinoEnMemoria).vaciar();
  });

  it("cerrar una visita entrega su resumen al destino", async () => {
    const visita = await startFieldSession(userAccountId, {
      locationId,
      operatorPersonId: personId,
      startedAt: new Date("2026-09-08T08:00:00Z"),
      provenanceClass: "original_record",
    });

    await recordInspection(userAccountId, {
      colonyId,
      occurredAt: new Date("2026-09-08T09:00:00Z"),
      outcome: "issue_observed",
    });

    // Control positivo del destino: antes de cerrar no hay nada. Sin esto, un
    // mensaje que ya estuviera ahí se leería como emitido por el cierre.
    expect((destinoDeBitacora as DestinoEnMemoria).leer()).toHaveLength(0);

    await completarVisita(userAccountId, { fieldSessionId: visita.id });

    const entregados = (destinoDeBitacora as DestinoEnMemoria).leer();
    expect(entregados).toHaveLength(1);
    expect(entregados[0]!.clase).toBe("resumen");
    expect(entregados[0]!.clave).toBe(`resumen:${visita.id}`);
    expect(entregados[0]!.enlace).toBe(`/apiaries/${locationId}`);
  });

  it("el resumen cuenta lo que el RASTRO dice, no lo que yo creo", async () => {
    const visita = await startFieldSession(userAccountId, {
      locationId,
      operatorPersonId: personId,
      startedAt: new Date("2026-09-08T10:00:00Z"),
      provenanceClass: "original_record",
    });
    await recordColonyEvent(userAccountId, {
      colonyId,
      eventType: "treatment",
      treatmentProduct: "Apivar",
      treatmentBatchLabel: `L-${RUN_ID.slice(-4)}`,
    });

    const emitido = await resumenDeVisita(visita.id);
    expect(emitido).not.toBeNull();
    // La visita no tiene FieldEvents colgados, así que su rastro es el suyo
    // propio: cero inspecciones. Es la afirmación honesta — el emisor no
    // inventa lo que ocurrió en el sitio, sólo lee lo que quedó ligado.
    expect(emitido!.resumen.fieldSessionId).toBe(visita.id);
    expect(emitido!.resumen.locationId).toBe(locationId);
    expect(emitido!.mensajes[0]!.texto).toContain("Visita cerrada");
  });

  it("una visita que no existe devuelve null, no un resumen vacío", async () => {
    // Cero y «no hay» son cosas distintas, que es la regla del Anexo C.
    expect(await resumenDeVisita("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
