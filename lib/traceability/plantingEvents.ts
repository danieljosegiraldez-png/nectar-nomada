/**
 * F1 (docs/implementation/30_F1_OPERACION_FINCA_ESQUEMA.md §4). "Siembra" and
 * "recepción de material vegetal" — the 600 Caturra seedlings from Cafelino,
 * received 2026-08-08. Schema/service only — no UI, by explicit
 * product-owner decision (`29_...md` §6).
 *
 * Reuses `lot:manage` for RBAC, same as `operations.ts`'s
 * LabourEntry/MaterialConsumptionEntry location-parent extension — this is
 * a new child row recording a fact under a Location, not an edit to the
 * Location record itself (that's `location:manage_attributes`,
 * `locations.ts`).
 */
import { prisma } from "../db";
import { requireLotAccess, TraceabilityAccessError, DEFAULT_NEW_RECORD_CLASSIFICATION } from "./lots";
import { recordAuditEvent } from "../audit";
import type { DataQuality, PlantingEventType, ProvenanceClass } from "../../generated/prisma/client";

export class PlantingEventValidationError extends Error {}

export interface RecordPlantingEventInput {
  locationId: string;
  eventType: PlantingEventType;
  varietal?: string | null;
  quantity?: number | null;
  unit?: string | null;
  sourceOrganizationId?: string | null;
  occurredAt?: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  dataQuality?: DataQuality | null;
}

export async function recordPlantingEvent(userAccountId: string, input: RecordPlantingEventInput) {
  if (input.quantity != null && input.quantity <= 0) {
    throw new PlantingEventValidationError("quantity_must_be_positive");
  }

  const location = await prisma.location.findUnique({ where: { id: input.locationId } });
  if (!location) throw new TraceabilityAccessError("location_not_found");

  await requireLotAccess(userAccountId, "manage", [{ locationId: input.locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION }]);

  const plantingEvent = await prisma.plantingEvent.create({
    data: {
      locationId: input.locationId,
      eventType: input.eventType,
      varietal: input.varietal ?? null,
      quantity: input.quantity ?? null,
      unit: input.unit ?? undefined,
      sourceOrganizationId: input.sourceOrganizationId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      operatorPersonId: input.operatorPersonId ?? null,
      notes: input.notes ?? null,
      provenanceClass: input.provenanceClass,
      sourceReference: input.sourceReference ?? null,
      dataQuality: input.dataQuality ?? null,
      createdBy: userAccountId,
    },
  });

  // C1 §3: evidentiary write (carries provenanceClass).
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "planting_event.create",
    entityType: "planting_event",
    entityId: plantingEvent.id,
    after: plantingEvent,
    sourceInterface: "traceability.service",
  });

  return plantingEvent;
}

export async function listPlantingEventsForLocation(userAccountId: string, locationId: string) {
  await requireLotAccess(userAccountId, "view", [{ locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION }]);

  return prisma.plantingEvent.findMany({
    where: { locationId },
    include: { sourceOrganization: true, operator: true },
    orderBy: { occurredAt: "desc" },
  });
}
