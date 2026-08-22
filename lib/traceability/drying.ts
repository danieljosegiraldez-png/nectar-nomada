/**
 * Phase 1, ticket T7 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §16, §34). Same pattern as T6's FermentationRun — the second "stage-run"
 * entity, deliberately no lotId of its own; which Lot is drying is
 * expressed via the stage_change LotTransformation(s) that reference this
 * run (dryingRunId). `locationId` on DryingRun is the drying site/bed —
 * descriptive context only, not a second RBAC gate; access is always
 * resolved against the source lot's own project/location.
 *
 *   startDryingRun — creates the run plus a stage_change LotTransformation
 *     (input: the lot entering drying, zero outputs).
 *   recordDryingTurnEvent — a simple typed log entry against an
 *     in-progress run (turned/covered/uncovered).
 *   endDryingRun — sets endedAt once and creates a second stage_change
 *     LotTransformation (same input lot, output: a new Lot at the next
 *     stage — green, per §8.3's lineage diagram).
 */
import { prisma } from "../db";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { recordAuditEvent } from "../audit";
import type { LotType, ProvenanceClass } from "../../generated/prisma/client";

async function resolveRunSourceLot(dryingRunId: string) {
  const transformation = await prisma.lotTransformation.findFirst({
    where: { dryingRunId },
    include: { inputs: { include: { lot: true } } },
    orderBy: { occurredAt: "asc" },
  });
  const inputLot = transformation?.inputs[0]?.lot;
  if (!inputLot) throw new TraceabilityAccessError("drying_run_not_found");
  return inputLot;
}

export interface StartDryingRunInput {
  lotId: string;
  method?: string | null;
  locationId?: string | null; // the drying site/bed
  layerDepthCm?: number | null;
  startedAt: Date;
  quantity?: number | null;
  unit?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required, no fallback — same reasoning as fermentation.ts's
  // StartFermentationRunInput (starting a run is an action taken).
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function startDryingRun(userAccountId: string, input: StartDryingRunInput) {
  const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);

  const result = await prisma.$transaction(async (tx) => {
    const run = await tx.dryingRun.create({
      data: {
        method: input.method ?? null,
        locationId: input.locationId ?? null,
        layerDepthCm: input.layerDepthCm ?? null,
        startedAt: input.startedAt,
        createdBy: userAccountId,
      },
    });

    const transformation = await tx.lotTransformation.create({
      data: {
        transformationType: "stage_change",
        occurredAt: input.startedAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
        dryingRunId: run.id,
        provenanceClass: input.provenanceClass,
        sourceReference: input.sourceReference ?? null,
        inputs: {
          create: [{ lotId: input.lotId, quantity: input.quantity ?? null, unit: input.unit ?? null }],
        },
      },
    });

    return { run, transformation };
  });

  // C1 §3 pattern: an evidentiary write.
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "drying_run.start",
    entityType: "drying_run",
    entityId: result.run.id,
    after: result.run,
    sourceInterface: "traceability.service",
  });

  return result;
}

export interface RecordDryingTurnEventInput {
  dryingRunId: string;
  eventType: "turned" | "covered" | "uncovered" | "other";
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
}

export async function recordDryingTurnEvent(userAccountId: string, input: RecordDryingTurnEventInput) {
  const sourceLot = await resolveRunSourceLot(input.dryingRunId);
  await requireLotAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification }]);

  return prisma.dryingTurnEvent.create({
    data: {
      dryingRunId: input.dryingRunId,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      operatorPersonId: input.operatorPersonId ?? null,
      notes: input.notes ?? null,
      createdBy: userAccountId,
    },
  });
}

export interface EndDryingRunInput {
  dryingRunId: string;
  endedAt: Date;
  outputLotCode: string;
  outputLotType: LotType;
  quantity?: number | null;
  unit?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required — same reasoning as StartDryingRunInput above.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function endDryingRun(userAccountId: string, input: EndDryingRunInput) {
  const run = await prisma.dryingRun.findUnique({ where: { id: input.dryingRunId } });
  if (!run) throw new TraceabilityAccessError("drying_run_not_found");
  if (run.endedAt) throw new TraceabilityAccessError("drying_run_already_ended");

  const sourceLot = await resolveRunSourceLot(input.dryingRunId);
  await requireLotAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification }]);

  const provenanceClass = input.provenanceClass;

  const result = await prisma.$transaction(async (tx) => {
    const endedRun = await tx.dryingRun.update({
      where: { id: input.dryingRunId },
      data: { endedAt: input.endedAt },
    });

    const transformation = await tx.lotTransformation.create({
      data: {
        transformationType: "stage_change",
        occurredAt: input.endedAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
        dryingRunId: input.dryingRunId,
        provenanceClass,
        sourceReference: input.sourceReference ?? null,
        inputs: {
          create: [{ lotId: sourceLot.id, quantity: input.quantity ?? null, unit: input.unit ?? null }],
        },
      },
    });

    const outputLot = await tx.lot.create({
      data: {
        lotCode: input.outputLotCode,
        lotType: input.outputLotType,
        organizationId: sourceLot.organizationId,
        projectId: sourceLot.projectId,
        locationId: sourceLot.locationId,
        createdBy: userAccountId,
      },
    });

    await tx.lotTransformationOutput.create({
      data: {
        transformationId: transformation.id,
        lotId: outputLot.id,
        quantity: input.quantity ?? null,
        unit: input.unit ?? null,
      },
    });

    if (input.quantity != null && input.unit) {
      await tx.quantityEvent.create({
        data: {
          lotId: outputLot.id,
          eventType: "process_output",
          quantity: input.quantity,
          unit: input.unit,
          occurredAt: input.endedAt,
          transformationId: transformation.id,
          createdBy: userAccountId,
          provenanceClass,
          sourceReference: input.sourceReference ?? null,
        },
      });
    }

    return { run: endedRun, transformation, outputLot };
  });

  // C1 §3 pattern: an evidentiary write.
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "drying_run.end",
    entityType: "drying_run",
    entityId: result.run.id,
    after: result.run,
    sourceInterface: "traceability.service",
  });

  return result;
}
