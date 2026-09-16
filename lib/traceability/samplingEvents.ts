import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { scopeTargetsFor, TraceabilityAccessError, DEFAULT_NEW_RECORD_CLASSIFICATION } from "./lots";
import type { ClassificationLevel } from "../rbac/types";
import type { SamplingEvent } from "../../generated/prisma/client";

export interface CreateSamplingEventInput {
  dryingBedLocationId?: string | null;
  dryingRunId?: string | null;
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
}

// El mismo permiso de createSampleFromLot, sin inventar un recurso RBAC.
async function requireSamplingAccess(userAccountId: string, context: {
  projectId?: string | null;
  locationId?: string | null;
  classification: ClassificationLevel;
}) {
  for (const target of scopeTargetsFor(context)) {
    if (await can(userAccountId, "manage", "sample", target, context.classification)) return;
  }
  throw new TraceabilityAccessError("no_sample_access");
}

export async function createSamplingEvent(
  userAccountId: string,
  input: CreateSamplingEventInput,
): Promise<SamplingEvent> {
  if (input.dryingRunId != null) {
    // DryingRun no tiene lotId: el origen vive en su transformación, como en drying.ts.
    const transformation = await prisma.lotTransformation.findFirst({
      where: { dryingRunId: input.dryingRunId },
      include: { inputs: { include: { lot: true } } },
      orderBy: { occurredAt: "asc" },
    });
    const lot = transformation?.inputs[0]?.lot;
    if (!lot) throw new TraceabilityAccessError("drying_run_not_found");
    await requireSamplingAccess(userAccountId, lot);
  }
  if (input.dryingBedLocationId != null) {
    const bed = await prisma.location.findUnique({ where: { id: input.dryingBedLocationId } });
    if (!bed) throw new TraceabilityAccessError("location_not_found");
    await requireSamplingAccess(userAccountId, { locationId: bed.id, classification: bed.classification });
  }
  if (input.dryingRunId == null && input.dryingBedLocationId == null) {
    // Sin contexto sólo una asignación de plataforma puede autorizar el acto.
    await requireSamplingAccess(userAccountId, { classification: DEFAULT_NEW_RECORD_CLASSIFICATION });
  }

  return prisma.$transaction(async (tx) => {
    const event = await tx.samplingEvent.create({
      data: {
        dryingBedLocationId: input.dryingBedLocationId ?? null,
        dryingRunId: input.dryingRunId ?? null,
        occurredAt: input.occurredAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent({
      actorUserAccountId: userAccountId,
      operation: "sampling_event.create",
      entityType: "sampling_event",
      entityId: event.id,
      after: event,
      sourceInterface: "traceability.service",
    }, tx);
    return event;
  });
}
