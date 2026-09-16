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
import { requireLocationAttributeAccess } from "./locations";
import { recordAuditEvent } from "../audit";
import type { DataQuality, HarvestWindowPrecision, PlantingEventType, ProvenanceClass } from "../../generated/prisma/client";

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

  const plantingEvent = await prisma.$transaction(async (tx) => {
    const plantingEvent = await tx.plantingEvent.create({
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
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "planting_event.create",
        entityType: "planting_event",
        entityId: plantingEvent.id,
        after: plantingEvent,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return plantingEvent;
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

export interface RecordEnteredProductionInput {
  plantingCohortId: string;
  /** Desde cuándo da cosecha, ya recortado a su precisión (`calcularFechaConPrecision`). */
  occurredAt: Date;
  occurredPrecision: HarvestWindowPrecision;
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
  notes?: string | null;
}

/**
 * Marca desde cuándo una siembra da cosecha — tablero de parcela, spec §5.
 *
 * **No reutiliza `recordPlantingEvent`, y es a propósito.** Esa función protege
 * con `lot:manage`, mientras que la parcela y la corrección de siembras
 * (`updatePlantingCohort`) usan `location:manage_attributes`. Reutilizarla
 * haría que alguien que ve el tablero y puede corregir una siembra fuera
 * rechazado al marcarla en producción. Además no admite ni la siembra ni la
 * precisión de la fecha.
 *
 * Corregir una fecha equivocada es llamar otra vez con la buena: el evento
 * anterior no se toca, y cuenta el registrado más recientemente
 * (`estadoDeProduccion`).
 */
export async function recordEnteredProduction(
  userAccountId: string,
  input: RecordEnteredProductionInput,
  ahora: Date = new Date(),
) {
  const cohorte = await prisma.plantingCohort.findUnique({
    where: { id: input.plantingCohortId },
    select: { id: true, locationId: true, status: true },
  });
  if (!cohorte) throw new PlantingEventValidationError("cohort_not_found");
  await requireLocationAttributeAccess(userAccountId, cohorte.locationId);
  if (cohorte.status !== "active") throw new PlantingEventValidationError("cohort_not_active");
  if (input.occurredAt.getTime() > ahora.getTime()) {
    throw new PlantingEventValidationError("production_date_in_future");
  }

  return prisma.$transaction(async (tx) => {
    const evento = await tx.plantingEvent.create({
      data: {
        locationId: cohorte.locationId,
        plantingCohortId: cohorte.id,
        eventType: "entered_production",
        occurredAt: input.occurredAt,
        occurredPrecision: input.occurredPrecision,
        // `unit` tiene «plantones» por defecto; este evento no cuenta material.
        unit: null,
        provenanceClass: input.provenanceClass,
        dataQuality: input.dataQuality ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "planting_event.entered_production",
        entityType: "planting_event",
        entityId: evento.id,
        after: evento,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return evento;
  });
}
