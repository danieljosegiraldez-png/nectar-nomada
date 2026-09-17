/**
 * ADR-154 — la valoración del técnico sobre una colonia, escrita al cerrar la visita.
 *
 * **Lo que esto protege.** El Anexo E pide «Valoración» como el **único** campo de etapa `close`
 * de la inspección, y el mapa la daba por sin sitio con la razón escrita: *«`note` es la nota de
 * campo; mezclarlas perdería cuál se escribió con el guante puesto»*.
 *
 * **Y lo que sólo se puede afirmar con la base:** que las reglas de plazo son **las de la visita**
 * y no unas nuevas. `Inspection` no tiene cierre ni ventana; inventarle una duplicaría la máquina
 * de `FieldSession`. Eso sólo se demuestra escribiendo una visita con su ventana vencida y viendo
 * que la valoración se rechaza — y con el control de que sin vencer sí entra.
 *
 * Grupo `base-sembrada`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearApiario, createHive, createColony } from "../../lib/apiary/hives";
import { recordInspection } from "../../lib/apiary/inspections";
import {
  registrarValoracionDeInspeccion,
  ValoracionInvalida,
} from "../../lib/apiary/valoracionDeInspeccion";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `val-${Date.now()}`;

describe("la valoración de una inspección", () => {
  let organizationId: string;
  let userAccountId: string;
  let personId: string;
  let apiarioId: string;
  let colonyId: string;
  let inspeccionSuelta: string;
  let inspeccionEnVisita: string;
  let sesionId: string;

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.create({
        data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
      })
    ).id;
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Val", displayName: `TEST Val (${RUN_ID})`, locale: "es" },
    });
    personId = person.id;
    userAccountId = (
      await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })
    ).id;

    // El ámbito de plataforma se REUSA, nunca se crea ni se borra: es compartido.
    const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
    const scope =
      (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
      (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: admin.id, scopeId: scope.id } });

    apiarioId = (await crearApiario(userAccountId, { name: `TEST Apiario (${RUN_ID})`, organizationId })).id;
    const colmena = await createHive(userAccountId, { identifier: `${RUN_ID}-01`, locationId: apiarioId });
    colonyId = (
      await createColony(userAccountId, {
        hiveId: colmena.id,
        startedAt: new Date("2026-09-01T00:00:00Z"),
        originType: "purchased",
        provenanceClass: "direct_observation",
      })
    ).id;

    // Dos inspecciones: una SIN visita y otra colgada de una, que es la distinción del servicio.
    inspeccionSuelta = (
      await recordInspection(userAccountId, { colonyId, outcome: "nothing_unusual", occurredAt: new Date("2026-09-10T12:00:00Z") })
    ).id;
    inspeccionEnVisita = (
      await recordInspection(userAccountId, { colonyId, outcome: "nothing_unusual", occurredAt: new Date("2026-09-11T12:00:00Z") })
    ).id;

    sesionId = (
      await prisma.fieldSession.create({
        data: {
          locationId: apiarioId,
          operatorPersonId: personId,
          startedAt: new Date("2026-09-11T10:00:00Z"),
          status: "completed",
          provenanceClass: "original_record",
        },
      })
    ).id;
    // El enlace real: `FieldEvent` es lo que une visita e inspección.
    const kind = await prisma.variableCatalogValue.findFirstOrThrow();
    await prisma.fieldEvent.create({
      data: {
        fieldSessionId: sesionId,
        eventKindValueId: kind.id,
        occurredAt: new Date("2026-09-11T12:00:00Z"),
        inspectionId: inspeccionEnVisita,
        provenanceClass: "direct_observation",
      },
    });
  });

  afterAll(async () => {
    await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: sesionId }) });
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: sesionId }) });
    const insp = [inspeccionSuelta, inspeccionEnVisita].filter(Boolean);
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "inspection", entityId: { in: insp } }) });
    await prisma.inspection.deleteMany({ where: assertDefinedWhere({ id: { in: insp } }) });
    const colonias = await prisma.colony.findMany({
      where: assertDefinedWhere({ hive: { locationId: apiarioId } }),
      select: { id: true },
    });
    await prisma.auditEvent.deleteMany({
      where: assertDefinedWhere({ entityType: "colony", entityId: { in: colonias.map((c) => c.id) } }),
    });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias.map((c) => c.id) } }) });
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId: apiarioId } }) });
    const colmenas = await prisma.hive.findMany({ where: assertDefinedWhere({ locationId: apiarioId }), select: { id: true } });
    await prisma.auditEvent.deleteMany({
      where: assertDefinedWhere({ entityType: "hive", entityId: { in: colmenas.map((h) => h.id) } }),
    });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId: apiarioId }) });
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "location", entityId: apiarioId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: apiarioId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("LO QUE EL ANEXO PIDE: se escribe, y se lee de la FILA", async () => {
    const r = await registrarValoracionDeInspeccion(userAccountId, {
      inspectionId: inspeccionEnVisita,
      assessment: "  Colonia fuerte; la reina pone bien. Volver en tres semanas.  ",
    });
    expect(r.origenDeLaVentana).toBe("visita");
    const fila = await prisma.inspection.findUniqueOrThrow({ where: { id: inspeccionEnVisita } });
    // Recortada: el espacio de un dictado no es parte de la valoración.
    expect(fila.assessment).toBe("Colonia fuerte; la reina pone bien. Volver en tres semanas.");
  });

  it("y NO toca `note`, que es la nota de campo — la distinción que la motiva", async () => {
    const fila = await prisma.inspection.findUniqueOrThrow({ where: { id: inspeccionEnVisita } });
    // Si las mezclara, se perdería cuál se escribió con el guante puesto.
    expect(fila.note).toBeNull();
    expect(fila.assessment).not.toBeNull();
  });

  it("escribe su AuditEvent con el ANTES, en la misma transacción", async () => {
    await registrarValoracionDeInspeccion(userAccountId, {
      inspectionId: inspeccionEnVisita,
      assessment: "Corregida: la reina no se vio.",
    });
    const eventos = await prisma.auditEvent.findMany({
      where: assertDefinedWhere({ entityType: "inspection", entityId: inspeccionEnVisita }),
      orderBy: { occurredAt: "asc" },
      select: { operation: true, before: true },
    });
    // **Se filtra por operación, no se exige que TODOS sean míos:** `recordInspection` escribe
    // su propio `inspection.create`, así que la fila comparte historial. Exigir «todos» era mi
    // error, y además habría pasado por casualidad si esa función no auditara.
    const mios = eventos.filter((e) => e.operation === "inspection.assessment");
    expect(mios.length).toBeGreaterThanOrEqual(2);
    // El segundo lleva el valor anterior: una valoración es una lectura del técnico, y saber
    // desde qué la cambió es parte de poder sostenerla.
    expect(JSON.stringify(mios[1]?.before)).toContain("Colonia fuerte");
    // Y control de que el primero NO tenía nada antes: la inspección nació sin valorar.
    expect(JSON.stringify(mios[0]?.before)).toContain("null");
  });

  it("el vacío BORRA, que es cómo se deshace una puesta por error", async () => {
    await registrarValoracionDeInspeccion(userAccountId, { inspectionId: inspeccionEnVisita, assessment: "   " });
    const fila = await prisma.inspection.findUniqueOrThrow({ where: { id: inspeccionEnVisita } });
    expect(fila.assessment).toBeNull();
  });

  it("LAS REGLAS SON LAS DE LA VISITA: con la ventana vencida, se rechaza", async () => {
    await prisma.fieldSession.update({
      where: { id: sesionId },
      data: { editWindowExpiresAt: new Date("2026-09-12T00:00:00Z") },
    });
    await expect(
      registrarValoracionDeInspeccion(
        userAccountId,
        { inspectionId: inspeccionEnVisita, assessment: "tarde" },
        new Date("2026-09-20T00:00:00Z"),
      ),
    ).rejects.toThrow(/ventana_de_edicion_vencida/);
  });

  it("y una visita CERRADA se dice distinto de una vencida, como allí", async () => {
    await prisma.fieldSession.update({
      where: { id: sesionId },
      data: { status: "locked", editWindowExpiresAt: null },
    });
    await expect(
      registrarValoracionDeInspeccion(userAccountId, { inspectionId: inspeccionEnVisita, assessment: "x" }),
    ).rejects.toThrow(/visita_cerrada/);
  });

  it("CONTROL: una inspección SIN visita se acepta, y lo dice", async () => {
    // Es la mitad que hace falsable lo anterior. Negarlo dejaría esa valoración sin poder
    // escribirse nunca, que es peor que escribirla sin plazo — y el servicio lo declara en vez
    // de dejar suponer que hubo un plazo.
    const r = await registrarValoracionDeInspeccion(userAccountId, {
      inspectionId: inspeccionSuelta,
      assessment: "Sin jornada abierta, pero la valoración existe.",
    });
    expect(r.origenDeLaVentana).toBe("sin_visita");
    const fila = await prisma.inspection.findUniqueOrThrow({ where: { id: inspeccionSuelta } });
    expect(fila.assessment).toContain("Sin jornada abierta");
  });

  it("una inspección que no existe se rechaza diciéndolo", async () => {
    await expect(
      registrarValoracionDeInspeccion(userAccountId, {
        inspectionId: "00000000-0000-0000-0000-000000000000",
        assessment: "x",
      }),
    ).rejects.toThrow(ValoracionInvalida);
  });
});
