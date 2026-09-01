/**
 * P2 §3–§5 (docs/implementation/43_P2_OPERATOR_CORE.md §8). Real Postgres,
 * RUN_ID-scoped fixtures, location-scoped Farm Operator — same shape as
 * plantingCohorts.test.ts, since both are gated by
 * `location:manage_attributes`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  startFieldSession,
  endFieldSession,
  recordFieldEvent,
  getFieldSessionTimeline,
  listFieldSessions,
  FieldSessionValidationError,
  LocationAccessError,
} from "../../lib/traceability/fieldSessions";
import { createLot } from "../../lib/traceability/lots";
import { recordMeasurement } from "../../lib/traceability/measurements";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `p2-${Date.now()}`;

let organizationId: string;
let projectId: string;
let plotId: string;
let otherPlotId: string;
let operatorPersonId: string;
let secondPersonId: string;
let authorizedUserAccountId: string;
let wrongLocationUserAccountId: string;
let observacionKindId: string;
let medicionKindId: string;
let cultivarValueId: string;

async function createTestPerson(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  return person.id;
}

async function createTestUserAccount(label: string) {
  const personId = await createTestPerson(label);
  const account = await prisma.userAccount.create({
    data: { personId, authProvider: "credentials", status: "active" },
  });
  return account.id;
}

async function assignFarmOperator(userAccountId: string, locationRefId: string) {
  const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationRefId } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: profile.id, scopeId: scope.id } });
}

async function eventKind(value: string) {
  const row = await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value, catalog: { key: "event_kind" } },
  });
  return row.id;
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const project = await prisma.project.create({
    data: { name: `TEST Project (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = project.id;

  const plot = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  plotId = plot.id;

  const otherPlot = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Other Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  otherPlotId = otherPlot.id;

  // A Person with no UserAccount — the normal case for field crew, and the
  // one Task cannot currently express.
  operatorPersonId = await createTestPerson("Picker");
  secondPersonId = await createTestPerson("SecondPicker");

  authorizedUserAccountId = await createTestUserAccount("Manager");
  await assignFarmOperator(authorizedUserAccountId, plotId);

  wrongLocationUserAccountId = await createTestUserAccount("WrongLocation");
  await assignFarmOperator(wrongLocationUserAccountId, otherPlotId);

  observacionKindId = await eventKind("observacion");
  medicionKindId = await eventKind("medicion");
  cultivarValueId = (
    await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Caturra", catalog: { key: "cultivar" } } })
  ).id;
});

afterAll(async () => {
  const locationIds = [plotId, otherPlotId];
  const sessions = await prisma.fieldSession.findMany({ where: { locationId: { in: locationIds } }, select: { id: true } });
  const sessionIds = sessions.map((s) => s.id);
  await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: { in: sessionIds } }) });
  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: sessionIds } }) });

  const lots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });

  const userIds = [authorizedUserAccountId, wrongLocationUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: locationIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("a session belongs to a Person, not an account", () => {
  it("records a session for an operator who has no UserAccount at all", async () => {
    const operator = await prisma.person.findUniqueOrThrow({
      where: { id: operatorPersonId },
      include: { userAccount: true },
    });
    // The premise: this is the normal case for field crew.
    expect(operator.userAccount).toBeNull();

    const session = await startFieldSession(authorizedUserAccountId, {
      locationId: plotId,
      operatorPersonId,
      startedAt: new Date("2026-08-28T08:00:00Z"),
      provenanceClass: "direct_observation",
    });

    expect(session.operatorPersonId).toBe(operatorPersonId);
    expect(session.taskId).toBeNull(); // unplanned sessions are real sessions
  });
});

describe("the timeline reconstructs the morning in order", () => {
  it("returns events by occurredAt, not by the order the server received them", async () => {
    const session = await startFieldSession(authorizedUserAccountId, {
      locationId: plotId,
      operatorPersonId,
      startedAt: new Date("2026-08-28T06:00:00Z"),
      provenanceClass: "direct_observation",
    });

    // Deliberately inserted out of chronological order, as a synced batch
    // would arrive.
    await recordFieldEvent(authorizedUserAccountId, {
      fieldSessionId: session.id,
      eventKindValueId: observacionKindId,
      occurredAt: new Date("2026-08-28T09:00:00Z"),
      notes: "third",
      provenanceClass: "direct_observation",
    });
    await recordFieldEvent(authorizedUserAccountId, {
      fieldSessionId: session.id,
      eventKindValueId: observacionKindId,
      occurredAt: new Date("2026-08-28T07:00:00Z"),
      notes: "first",
      provenanceClass: "direct_observation",
    });
    await recordFieldEvent(authorizedUserAccountId, {
      fieldSessionId: session.id,
      eventKindValueId: observacionKindId,
      occurredAt: new Date("2026-08-28T08:00:00Z"),
      notes: "second",
      provenanceClass: "direct_observation",
    });

    const { events } = await getFieldSessionTimeline(authorizedUserAccountId, session.id);
    expect(events.map((e) => e.notes)).toEqual(["first", "second", "third"]);
  });

  it("indexes a Measurement without duplicating its values", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-lot`,
      lotType: "cherry",
      organizationId,
      projectId,
      locationId: plotId,
    });
    const measurement = await recordMeasurement(authorizedUserAccountId, {
      lotId: lot.id,
      variable: "brix",
      value: 21.4,
      unit: "Bx",
      occurredAt: new Date("2026-08-28T07:30:00Z"),
      provenanceClass: "measured_fact",
    });

    const session = await startFieldSession(authorizedUserAccountId, {
      locationId: plotId,
      operatorPersonId,
      startedAt: new Date("2026-08-28T07:00:00Z"),
      provenanceClass: "direct_observation",
    });
    const event = await recordFieldEvent(authorizedUserAccountId, {
      fieldSessionId: session.id,
      eventKindValueId: medicionKindId,
      occurredAt: new Date("2026-08-28T07:30:00Z"),
      measurementId: measurement.id,
      provenanceClass: "direct_observation",
    });

    // The spine points at the row; it does not copy the reading.
    expect(event.measurementId).toBe(measurement.id);
    expect(Object.keys(event)).not.toContain("value");
    const stillOne = await prisma.measurement.count({ where: { lotId: lot.id, variable: "brix" } });
    expect(stillOne).toBe(1);
  });

  it("refuses an event naming two subjects — the timeline must not be ambiguous", async () => {
    const session = await startFieldSession(authorizedUserAccountId, {
      locationId: plotId,
      operatorPersonId,
      startedAt: new Date("2026-08-28T06:00:00Z"),
      provenanceClass: "direct_observation",
    });
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-lot2`,
      lotType: "cherry",
      organizationId,
      projectId,
      locationId: plotId,
    });
    const measurement = await recordMeasurement(authorizedUserAccountId, {
      lotId: lot.id,
      variable: "ph",
      value: 4.2,
      unit: "pH",
      occurredAt: new Date("2026-08-28T07:00:00Z"),
      provenanceClass: "measured_fact",
    });
    const asset = await prisma.asset.create({
      data: {
        assetType: "photo",
        storageKey: `${RUN_ID}/photo.jpg`,
        storageBucket: "test",
        mimeType: "image/jpeg",
        sizeBytes: 1,
        provenanceClass: "direct_observation",
      },
    });

    await expect(
      recordFieldEvent(authorizedUserAccountId, {
        fieldSessionId: session.id,
        eventKindValueId: observacionKindId,
        occurredAt: new Date("2026-08-28T07:00:00Z"),
        measurementId: measurement.id,
        assetId: asset.id,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(FieldSessionValidationError);

    await prisma.asset.delete({ where: { id: asset.id } });
  });
});

describe("coordinates are all-or-nothing", () => {
  it("refuses a latitude with no longitude", async () => {
    await expect(
      startFieldSession(authorizedUserAccountId, {
        locationId: plotId,
        operatorPersonId,
        startedAt: new Date(),
        start: { latitude: 9.2 },
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(FieldSessionValidationError);
  });

  it("refuses an out-of-range latitude", async () => {
    await expect(
      startFieldSession(authorizedUserAccountId, {
        locationId: plotId,
        operatorPersonId,
        startedAt: new Date(),
        start: { latitude: 120, longitude: -79.5 },
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(FieldSessionValidationError);
  });

  it("accepts a complete fix with accuracy", async () => {
    const session = await startFieldSession(authorizedUserAccountId, {
      locationId: plotId,
      operatorPersonId,
      startedAt: new Date(),
      start: { latitude: 9.1806, longitude: -79.4, accuracyM: 4.5 },
      provenanceClass: "direct_observation",
    });
    expect(session.startLatitude).toBeCloseTo(9.1806);
    expect(session.startAccuracyM).toBe(4.5);
  });
});

describe("capture timestamps", () => {
  it("keeps occurredAt, recordedAt and createdAt as three separate facts", async () => {
    const occurredAt = new Date("2026-08-28T14:00:00Z");
    const recordedAt = new Date("2026-08-28T14:23:00Z");

    const session = await startFieldSession(authorizedUserAccountId, {
      locationId: plotId,
      operatorPersonId,
      startedAt: occurredAt,
      provenanceClass: "direct_observation",
      capture: { recordedAt },
    });

    // The audit's worked example: measured at 14:00, entered at 14:23, and the
    // server saw it whenever it saw it. Previously the schema held one of these.
    expect(session.startedAt).toEqual(occurredAt);
    expect(session.recordedAt).toEqual(recordedAt);
    expect(session.createdAt).not.toEqual(recordedAt);
    // Nothing has synced — syncedAt belongs to Phase 4's sync path.
    expect(session.syncedAt).toBeNull();
  });

  it("refuses a recordedAt before the thing happened — that is a clock problem", async () => {
    await expect(
      startFieldSession(authorizedUserAccountId, {
        locationId: plotId,
        operatorPersonId,
        startedAt: new Date("2026-08-28T14:00:00Z"),
        provenanceClass: "direct_observation",
        capture: { recordedAt: new Date("2026-08-28T13:00:00Z") },
      }),
    ).rejects.toThrow(FieldSessionValidationError);
  });
});

describe("session lifecycle", () => {
  it("sets endedAt once and refuses a second end", async () => {
    const session = await startFieldSession(authorizedUserAccountId, {
      locationId: plotId,
      operatorPersonId,
      startedAt: new Date("2026-08-28T06:00:00Z"),
      provenanceClass: "direct_observation",
    });
    const ended = await endFieldSession(authorizedUserAccountId, {
      fieldSessionId: session.id,
      endedAt: new Date("2026-08-28T11:00:00Z"),
    });
    expect(ended.endedAt).not.toBeNull();

    await expect(
      endFieldSession(authorizedUserAccountId, { fieldSessionId: session.id, endedAt: new Date() }),
    ).rejects.toThrow(FieldSessionValidationError);
  });

  it("refuses events on an ended session, and events before it started", async () => {
    const session = await startFieldSession(authorizedUserAccountId, {
      locationId: plotId,
      operatorPersonId,
      startedAt: new Date("2026-08-28T06:00:00Z"),
      provenanceClass: "direct_observation",
    });

    await expect(
      recordFieldEvent(authorizedUserAccountId, {
        fieldSessionId: session.id,
        eventKindValueId: observacionKindId,
        occurredAt: new Date("2026-08-28T05:00:00Z"),
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(FieldSessionValidationError);

    await endFieldSession(authorizedUserAccountId, {
      fieldSessionId: session.id,
      endedAt: new Date("2026-08-28T11:00:00Z"),
    });
    await expect(
      recordFieldEvent(authorizedUserAccountId, {
        fieldSessionId: session.id,
        eventKindValueId: observacionKindId,
        occurredAt: new Date("2026-08-28T10:00:00Z"),
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(FieldSessionValidationError);
  });

  it("defaults an event's operator to the session's, and allows overriding it", async () => {
    const session = await startFieldSession(authorizedUserAccountId, {
      locationId: plotId,
      operatorPersonId,
      startedAt: new Date("2026-08-28T06:00:00Z"),
      provenanceClass: "direct_observation",
    });

    const inherited = await recordFieldEvent(authorizedUserAccountId, {
      fieldSessionId: session.id,
      eventKindValueId: observacionKindId,
      occurredAt: new Date("2026-08-28T07:00:00Z"),
      provenanceClass: "direct_observation",
    });
    expect(inherited.operatorPersonId).toBe(operatorPersonId);

    // Two people on one visit is ordinary.
    const explicit = await recordFieldEvent(authorizedUserAccountId, {
      fieldSessionId: session.id,
      eventKindValueId: observacionKindId,
      occurredAt: new Date("2026-08-28T07:30:00Z"),
      operatorPersonId: secondPersonId,
      provenanceClass: "direct_observation",
    });
    expect(explicit.operatorPersonId).toBe(secondPersonId);
  });
});

describe("event kind is validated against its own catalog", () => {
  it("refuses a catalog value from a different vocabulary", async () => {
    const session = await startFieldSession(authorizedUserAccountId, {
      locationId: plotId,
      operatorPersonId,
      startedAt: new Date("2026-08-28T06:00:00Z"),
      provenanceClass: "direct_observation",
    });

    await expect(
      recordFieldEvent(authorizedUserAccountId, {
        fieldSessionId: session.id,
        // A cultivar is not a kind of moment.
        eventKindValueId: cultivarValueId,
        occurredAt: new Date("2026-08-28T07:00:00Z"),
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(FieldSessionValidationError);
  });
});

describe("dos escrituras que compiten de verdad", () => {
  /** Abre una jornada lista para competir contra ella. */
  async function abrirJornada(sufijo: string) {
    return startFieldSession(authorizedUserAccountId, {
      locationId: plotId,
      operatorPersonId,
      startedAt: new Date("2026-03-12T07:00:00Z"),
      notes: `carrera-${sufijo}`,
      provenanceClass: "direct_observation",
    });
  }

  it("dos cierres simultáneos: uno gana, el otro se entera", async () => {
    const sesion = await abrirJornada("cierre");
    // Sin `await` entre medias: las dos salen antes de que ninguna termine, que
    // es lo que la versión anterior no soportaba — leía, comprobaba, y escribía
    // sin condición, así que las dos pasaban.
    const resultados = await Promise.allSettled([
      endFieldSession(authorizedUserAccountId, {
        fieldSessionId: sesion.id,
        endedAt: new Date("2026-03-12T11:00:00Z"),
      }),
      endFieldSession(authorizedUserAccountId, {
        fieldSessionId: sesion.id,
        endedAt: new Date("2026-03-12T12:00:00Z"),
      }),
    ]);

    const ok = resultados.filter((r) => r.status === "fulfilled");
    const fallidas = resultados.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(fallidas).toHaveLength(1);

    // Y la hora guardada es la de quien ganó, no la de la última en llegar.
    const guardada = await prisma.fieldSession.findUniqueOrThrow({ where: { id: sesion.id } });
    expect(guardada.endedAt).not.toBeNull();
    const auditorias = await prisma.auditEvent.count({
      where: { entityId: sesion.id, operation: "field_session.end" },
    });
    expect(auditorias).toBe(1);
  });

  it("un evento que llega después del cierre no entra", async () => {
    const sesion = await abrirJornada("tardio");
    await endFieldSession(authorizedUserAccountId, {
      fieldSessionId: sesion.id,
      endedAt: new Date("2026-03-12T11:00:00Z"),
    });

    await expect(
      recordFieldEvent(authorizedUserAccountId, {
        fieldSessionId: sesion.id,
        eventKindValueId: observacionKindId,
        occurredAt: new Date("2026-03-12T09:00:00Z"),
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow("session_already_ended");
  });

  it("un evento fechado DESPUÉS del cierre se distingue del que llega tarde", async () => {
    // Dos hechos distintos: «anoté algo durante la visita y sincronizó tarde» y
    // «esto pasó cuando la visita ya había terminado». El segundo no pertenece
    // a esa jornada aunque llegue por la misma vía.
    const sesion = await abrirJornada("posterior");
    await endFieldSession(authorizedUserAccountId, {
      fieldSessionId: sesion.id,
      endedAt: new Date("2026-03-12T11:00:00Z"),
    });

    await expect(
      recordFieldEvent(authorizedUserAccountId, {
        fieldSessionId: sesion.id,
        eventKindValueId: observacionKindId,
        occurredAt: new Date("2026-03-12T15:00:00Z"),
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow("event_after_session_end");
  });
});

describe("RBAC", () => {
  it("denies opening a session on a block the operator cannot manage", async () => {
    await expect(
      startFieldSession(wrongLocationUserAccountId, {
        locationId: plotId,
        operatorPersonId,
        startedAt: new Date(),
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("denies reading a timeline for a block outside scope", async () => {
    const session = await startFieldSession(authorizedUserAccountId, {
      locationId: plotId,
      operatorPersonId,
      startedAt: new Date(),
      provenanceClass: "direct_observation",
    });
    await expect(getFieldSessionTimeline(wrongLocationUserAccountId, session.id)).rejects.toThrow(LocationAccessError);
  });

  it("lists sessions with their event counts for an authorized caller", async () => {
    const sessions = await listFieldSessions(authorizedUserAccountId, plotId);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0]).toHaveProperty("_count");
  });
});
