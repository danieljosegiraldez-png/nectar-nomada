/**
 * P2 §3–§5 (docs/implementation/43_P2_OPERATOR_CORE.md). Field sessions, the
 * field-event spine, and the capture timestamps that make a device-recorded
 * row honest about when it happened.
 *
 * RBAC reuses `location:manage_attributes` through
 * `requireLocationAttributeAccess`, the same choice ADR-095 made for planting
 * cohorts and for the same reason: a session is a record *about* a Location,
 * gated by authority over that Location, and ADR-091 makes a permission with
 * nowhere to be used a build failure.
 *
 * **`operatorPersonId` is a `Person`, never a `UserAccount`.** Most Person
 * rows in this database have no email and therefore no account. A session
 * recorded by someone who cannot log in is the normal case, and a model that
 * cannot express it would exclude most of the people doing the work — the same
 * blocker `Task.assignedToUserAccountId` still has (P2 §1, not built here).
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLocationAttributeAccess, LocationAccessError } from "./locations";
import type { DataQuality, ProvenanceClass } from "../../generated/prisma/client";

export class FieldSessionValidationError extends Error {}

export interface Coordinates {
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
}

/**
 * Capture metadata a device supplies. All optional — a row created in the web
 * app has no device and no separate capture time, and pretending otherwise
 * would invent facts.
 */
export interface CaptureMetadata {
  /** Device clock when the operator entered it, distinct from when it happened. */
  recordedAt?: Date | null;
  captureDeviceId?: string | null;
}

/**
 * A position is all-or-nothing. Latitude without longitude is not a partial
 * fix, it is a bug — and half a coordinate stored as though it were data is
 * worse than none, because a map will happily plot it somewhere wrong.
 */
function validateCoordinates(coords: Coordinates | undefined, label: string) {
  if (!coords) return;
  const hasLat = coords.latitude != null;
  const hasLon = coords.longitude != null;
  if (hasLat !== hasLon) throw new FieldSessionValidationError(`${label}_incomplete_coordinates`);
  if (hasLat && (coords.latitude! < -90 || coords.latitude! > 90)) {
    throw new FieldSessionValidationError(`${label}_latitude_out_of_range`);
  }
  if (hasLon && (coords.longitude! < -180 || coords.longitude! > 180)) {
    throw new FieldSessionValidationError(`${label}_longitude_out_of_range`);
  }
  if (coords.accuracyM != null && coords.accuracyM < 0) {
    throw new FieldSessionValidationError(`${label}_negative_accuracy`);
  }
}

/**
 * Entering something before it happened is a clock problem, not a record.
 * Caught here rather than tolerated, because a fermentation curve
 * reconstructed from a drifting device clock is wrong in a way nobody notices
 * until the conclusions are already drawn.
 */
function validateCaptureTimes(occurredAt: Date, capture: CaptureMetadata | undefined) {
  if (capture?.recordedAt && capture.recordedAt < occurredAt) {
    throw new FieldSessionValidationError("recorded_before_occurred");
  }
}

export interface StartFieldSessionInput {
  locationId: string;
  operatorPersonId: string;
  taskId?: string | null;
  startedAt: Date;
  start?: Coordinates;
  notes?: string | null;
  // ADR-038 — required, no default.
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
  capture?: CaptureMetadata;
}

export async function startFieldSession(userAccountId: string, input: StartFieldSessionInput) {
  await requireLocationAttributeAccess(userAccountId, input.locationId);

  const operator = await prisma.person.findUnique({ where: { id: input.operatorPersonId } });
  if (!operator) throw new FieldSessionValidationError("operator_not_found");

  validateCoordinates(input.start, "start");
  validateCaptureTimes(input.startedAt, input.capture);

  const session = await prisma.fieldSession.create({
    data: {
      locationId: input.locationId,
      operatorPersonId: input.operatorPersonId,
      taskId: input.taskId ?? null,
      startedAt: input.startedAt,
      startLatitude: input.start?.latitude ?? null,
      startLongitude: input.start?.longitude ?? null,
      startAccuracyM: input.start?.accuracyM ?? null,
      notes: input.notes ?? null,
      provenanceClass: input.provenanceClass,
      dataQuality: input.dataQuality ?? null,
      recordedAt: input.capture?.recordedAt ?? null,
      deviceId: input.capture?.captureDeviceId ?? null,
      createdBy: userAccountId,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "field_session.start",
    entityType: "field_session",
    entityId: session.id,
    after: session,
    sourceInterface: "traceability.service",
  });

  return session;
}

/**
 * Ends a session. `endedAt` is set once — a real one-time transition recording
 * an actual event, the same shape as `FermentationRun.endedAt` and
 * `StorageAssignment.endedAt`, not an editable field.
 */
export async function endFieldSession(userAccountId: string, input: { fieldSessionId: string; endedAt: Date }) {
  const existing = await prisma.fieldSession.findUnique({ where: { id: input.fieldSessionId } });
  if (!existing) throw new FieldSessionValidationError("session_not_found");
  if (existing.endedAt) throw new FieldSessionValidationError("session_already_ended");
  if (input.endedAt < existing.startedAt) throw new FieldSessionValidationError("ended_before_started");

  await requireLocationAttributeAccess(userAccountId, existing.locationId);

  // Escritura CONDICIONADA a que siga abierta. La comprobación de arriba lee y
  // la escritura de abajo escribe, y entre las dos cabe otra petición: sin la
  // condición, dos cierres simultáneos pasaban los dos y el segundo pisaba la
  // hora del primero, dejando dos auditorías de una transición que sólo ocurre
  // una vez. Lo señaló una revisión independiente.
  //
  // `updateMany` es lo que permite condicionar por algo que no es la clave
  // primaria; `count` es cero exactamente cuando otra petición ganó.
  const { count } = await prisma.fieldSession.updateMany({
    where: { id: input.fieldSessionId, endedAt: null },
    data: { endedAt: input.endedAt },
  });
  if (count === 0) throw new FieldSessionValidationError("session_already_ended");

  const ended = await prisma.fieldSession.findUniqueOrThrow({ where: { id: input.fieldSessionId } });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "field_session.end",
    entityType: "field_session",
    entityId: ended.id,
    before: existing,
    after: ended,
    sourceInterface: "traceability.service",
  });

  return ended;
}

/** The domain row this event indexes. At most one — the event says *when*, that row says *what*. */
export interface FieldEventSubject {
  measurementId?: string | null;
  quantityEventId?: string | null;
  specimenObservationId?: string | null;
  assetId?: string | null;
  harvestEventId?: string | null;
  lotTransformationId?: string | null;
}

export interface RecordFieldEventInput extends FieldEventSubject {
  fieldSessionId: string;
  /** A value from the `event_kind` catalog. */
  eventKindValueId: string;
  occurredAt: Date;
  position?: Coordinates;
  operatorPersonId?: string | null;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  capture?: CaptureMetadata;
}

const SUBJECT_KEYS = [
  "measurementId",
  "quantityEventId",
  "specimenObservationId",
  "assetId",
  "harvestEventId",
  "lotTransformationId",
] as const;

export async function recordFieldEvent(userAccountId: string, input: RecordFieldEventInput) {
  const session = await prisma.fieldSession.findUnique({ where: { id: input.fieldSessionId } });
  if (!session) throw new FieldSessionValidationError("session_not_found");
  // Una jornada cerrada rechaza el evento, pero DICE cuál de los dos casos es.
  // Son hechos distintos: «anoté esto durante la visita y sincronizó tarde» y
  // «esto pasó cuando la visita ya había terminado». El segundo no pertenece a
  // esa jornada aunque llegue por la misma vía, y quien lea el error necesita
  // saber si le falta una jornada o si se equivocó de jornada.
  if (session.endedAt) {
    throw new FieldSessionValidationError(
      input.occurredAt > session.endedAt ? "event_after_session_end" : "session_already_ended",
    );
  }

  await requireLocationAttributeAccess(userAccountId, session.locationId);

  // At most one subject. Two would make the timeline ambiguous about which row
  // this moment refers to, and the spine's whole value is that it is not.
  const subjects = SUBJECT_KEYS.filter((key) => input[key] != null);
  if (subjects.length > 1) throw new FieldSessionValidationError("multiple_subjects");

  const kind = await prisma.variableCatalogValue.findUnique({
    where: { id: input.eventKindValueId },
    include: { catalog: { select: { key: true } } },
  });
  if (!kind) throw new FieldSessionValidationError("event_kind_not_found");
  if (kind.catalog.key !== "event_kind") throw new FieldSessionValidationError("event_kind_wrong_catalog");

  validateCoordinates(input.position, "position");
  validateCaptureTimes(input.occurredAt, input.capture);

  // An event before its session started belongs to a different session.
  if (input.occurredAt < session.startedAt) throw new FieldSessionValidationError("event_before_session_start");

  // Se relee el estado de la jornada JUSTO antes de insertar, y se rechaza si
  // se cerró mientras tanto. No es una carrera exótica: `FieldEvent` lleva
  // `recordedAt`, `syncedAt` y `deviceId` porque está pensado para llegar
  // TARDE, sincronizado desde un dispositivo que estuvo sin señal. Un evento
  // anotado en el campo y sincronizado después de que alguien cerrara la
  // jornada desde otro sitio es el camino previsto, no el borde.
  //
  // La relectura estrecha la ventana; no la cierra —eso pediría un bloqueo o
  // una restricción en la base— y por eso también se valida contra `endedAt`
  // cuando lo hay: un evento fechado DESPUÉS del cierre no pertenece a esa
  // jornada aunque llegue a tiempo.
  const alInsertar = await prisma.fieldSession.findUniqueOrThrow({
    where: { id: input.fieldSessionId },
    select: { endedAt: true },
  });
  if (alInsertar.endedAt) {
    if (input.occurredAt > alInsertar.endedAt) {
      throw new FieldSessionValidationError("event_after_session_end");
    }
    throw new FieldSessionValidationError("session_already_ended");
  }

  const event = await prisma.fieldEvent.create({
    data: {
      fieldSessionId: input.fieldSessionId,
      // Follow an alias to its canonical row, same rule as cultivars (ADR-095):
      // otherwise a timeline groups the same kind of moment under two labels.
      eventKindValueId: kind.aliasOfId ?? kind.id,
      occurredAt: input.occurredAt,
      latitude: input.position?.latitude ?? null,
      longitude: input.position?.longitude ?? null,
      accuracyM: input.position?.accuracyM ?? null,
      operatorPersonId: input.operatorPersonId ?? session.operatorPersonId,
      notes: input.notes ?? null,
      measurementId: input.measurementId ?? null,
      quantityEventId: input.quantityEventId ?? null,
      specimenObservationId: input.specimenObservationId ?? null,
      assetId: input.assetId ?? null,
      harvestEventId: input.harvestEventId ?? null,
      lotTransformationId: input.lotTransformationId ?? null,
      provenanceClass: input.provenanceClass,
      recordedAt: input.capture?.recordedAt ?? null,
      deviceId: input.capture?.captureDeviceId ?? null,
      createdBy: userAccountId,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "field_event.record",
    entityType: "field_event",
    entityId: event.id,
    after: event,
    sourceInterface: "traceability.service",
  });

  return event;
}

/**
 * A session and everything that happened in it, in the order it happened.
 *
 * Ordered by `occurredAt` — when things actually happened — not `createdAt`,
 * which for a synced batch is the order the server received them and says
 * nothing about the morning's work.
 */
export async function getFieldSessionTimeline(userAccountId: string, fieldSessionId: string) {
  const session = await prisma.fieldSession.findUnique({
    where: { id: fieldSessionId },
    include: {
      location: { select: { id: true, name: true, locationType: true } },
      operator: { select: { id: true, displayName: true } },
      task: { select: { id: true, title: true, status: true } },
    },
  });
  if (!session) throw new FieldSessionValidationError("session_not_found");

  await requireLocationAttributeAccess(userAccountId, session.locationId);

  const events = await prisma.fieldEvent.findMany({
    where: { fieldSessionId },
    include: {
      eventKindValue: { select: { value: true, definition: true } },
      operator: { select: { id: true, displayName: true } },
    },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
  });

  return { session, events };
}

/** Sessions at a location, most recent first. */
export async function listFieldSessions(userAccountId: string, locationId: string) {
  await requireLocationAttributeAccess(userAccountId, locationId);
  return prisma.fieldSession.findMany({
    where: { locationId },
    include: {
      operator: { select: { id: true, displayName: true } },
      _count: { select: { events: true } },
    },
    orderBy: { startedAt: "desc" },
  });
}

export { LocationAccessError };
