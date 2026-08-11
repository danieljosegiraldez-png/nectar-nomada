/**
 * Phase 1, ticket T6 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §15, §34). First "stage-run" entity — sets the pattern T7 (Drying) and T8
 * (Storage) follow.
 *
 * FermentationRun deliberately has no lotId of its own (§15: "input/output
 * lot(s) are not FKs on FermentationRun directly, they're expressed through
 * the LotTransformation that references this run"). Lifecycle:
 *
 *   startFermentationRun — creates the run plus a stage_change
 *     LotTransformation (input: the lot entering fermentation, zero
 *     outputs — nothing changes lot-identity-wise yet, matching how T1's
 *     recordTransformation already supports zero-output transformations
 *     for sample_extraction/loss/disposal/sale).
 *   recordFermentationIntervention — a simple typed log entry against an
 *     in-progress run (agitation, addition, sample, etc.).
 *   endFermentationRun — sets endedAt once (a real one-time transition
 *     recording an actual event, not a correction — same as
 *     StorageAssignment's own endedAt, §17) and creates a second
 *     stage_change LotTransformation (same input lot, output: a new Lot at
 *     the next stage), matching §8.3's lineage diagram exactly.
 *
 * Both transformations carry fermentationRunId so "what's this run for" is
 * always a real, queryable fact (needed for RBAC checks mid-run and for
 * T10's Active Operations view), not something reconstructed only once a
 * run ends.
 */
import { prisma } from "../db";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import type { LotType, ProvenanceClass } from "../../generated/prisma/client";

async function resolveRunSourceLot(fermentationRunId: string) {
  const transformation = await prisma.lotTransformation.findFirst({
    where: { fermentationRunId },
    include: { inputs: { include: { lot: true } } },
    orderBy: { occurredAt: "asc" },
  });
  const inputLot = transformation?.inputs[0]?.lot;
  if (!inputLot) throw new TraceabilityAccessError("fermentation_run_not_found");
  return inputLot;
}

export interface StartFermentationRunInput {
  lotId: string;
  vesselNote?: string | null;
  startedAt: Date;
  operatorPersonId?: string | null;
  inoculated?: boolean;
  inoculationNote?: string | null;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
  // T9.5: required, no fallback. app/actions/traceability.ts passes
  // "original_record" — starting a run is an action taken, not a
  // measurement (per T9.5 §3(b)'s "lot merge or transformation" example).
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function startFermentationRun(userAccountId: string, input: StartFermentationRunInput) {
  const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId }]);

  return prisma.$transaction(async (tx) => {
    const run = await tx.fermentationRun.create({
      data: {
        vesselNote: input.vesselNote ?? null,
        startedAt: input.startedAt,
        operatorPersonId: input.operatorPersonId ?? null,
        inoculated: input.inoculated ?? false,
        inoculationNote: input.inoculationNote ?? null,
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
        fermentationRunId: run.id,
        provenanceClass: input.provenanceClass,
        sourceReference: input.sourceReference ?? null,
        inputs: {
          create: [{ lotId: input.lotId, quantity: input.quantity ?? null, unit: input.unit ?? null }],
        },
      },
    });

    return { run, transformation };
  });
}

export interface RecordFermentationInterventionInput {
  fermentationRunId: string;
  interventionType: "inoculation" | "agitation" | "purge" | "addition" | "sample" | "transfer" | "termination" | "other";
  occurredAt: Date;
  notes?: string | null;
}

export async function recordFermentationIntervention(userAccountId: string, input: RecordFermentationInterventionInput) {
  const sourceLot = await resolveRunSourceLot(input.fermentationRunId);
  await requireLotAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId }]);

  return prisma.fermentationIntervention.create({
    data: {
      fermentationRunId: input.fermentationRunId,
      interventionType: input.interventionType,
      occurredAt: input.occurredAt,
      notes: input.notes ?? null,
      createdBy: userAccountId,
    },
  });
}

export interface EndFermentationRunInput {
  fermentationRunId: string;
  endedAt: Date;
  outputLotCode: string;
  outputLotType: LotType;
  quantity?: number | null;
  unit?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required — same reasoning as StartFermentationRunInput above.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function endFermentationRun(userAccountId: string, input: EndFermentationRunInput) {
  const run = await prisma.fermentationRun.findUnique({ where: { id: input.fermentationRunId } });
  if (!run) throw new TraceabilityAccessError("fermentation_run_not_found");
  if (run.endedAt) throw new TraceabilityAccessError("fermentation_run_already_ended");

  const sourceLot = await resolveRunSourceLot(input.fermentationRunId);
  await requireLotAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId }]);

  const provenanceClass = input.provenanceClass;

  return prisma.$transaction(async (tx) => {
    const endedRun = await tx.fermentationRun.update({
      where: { id: input.fermentationRunId },
      data: { endedAt: input.endedAt },
    });

    const transformation = await tx.lotTransformation.create({
      data: {
        transformationType: "stage_change",
        occurredAt: input.endedAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
        fermentationRunId: input.fermentationRunId,
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

    // Same fix as T1's recordTransformation: seed the output lot's own
    // quantity ledger so computeCurrentQuantity reports correctly for it.
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
}
