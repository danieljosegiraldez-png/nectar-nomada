/**
 * R1 (docs/implementation/33_R1_ROASTSESSION_TAXONOMIA_SENSORIAL.md §1).
 * `RoastSession` follows FermentationRun/DryingRun's structural principle —
 * an execution record hanging off the transformation graph via a dedicated
 * FK (`LotTransformation.roastSessionId`, matching `fermentationRunId`/
 * `dryingRunId` exactly), never a parallel entity with its own lot FKs.
 *
 * One deliberate departure from Fermentation/DryingRun's own shape: those
 * two are recorded in two calls (start now, end later) because a real
 * ferment/dry genuinely spans an unknown-at-start duration. A roast is
 * short and its own real capture point — every §4 verification scenario
 * describes — is "log the whole session once it's done," the same shape
 * HarvestEvent already uses for its own short, bounded activity.
 * `recordRoastSession` is therefore one call, not a start/end pair.
 *
 * The already-verified case (§1.1) — one green Lot roasted three ways,
 * recorded as one `split` LotTransformation with three outputs — is
 * deliberately NOT reused here, because each of the three roasts is a
 * genuinely separate execution (different roaster, equipment, profile),
 * which one shared transformation row can't express (one roastSessionId
 * per transformation). Recording each roast as its own `stage_change`
 * transformation, all sharing the same green Lot as input, produces the
 * identical queryable DAG — getLotLineage's recursive CTE follows
 * lot_transformation_input/output edges generically, indifferent to
 * whether three children came from one transformation row or three —
 * without touching recordTransformation or the split mechanism at all.
 */
import { prisma } from "../db";
import { requireLotAccess, resolveLotVisibility, lotMatchesVisibility, TraceabilityAccessError } from "./lots";
import { recordAuditEvent } from "../audit";
import type { ProvenanceClass } from "../../generated/prisma/client";

export class RoastSessionValidationError extends Error {}

export interface RecordRoastSessionInput {
  lotId: string;
  outputLotCode: string;
  roastLevel?: string | null;
  equipmentNote?: string | null;
  roasterPersonId?: string | null;
  chargeWeightKg?: number | null;
  dischargeWeightKg?: number | null;
  startedAt: Date;
  endedAt?: Date | null;
  firstCrackAt?: Date | null;
  secondCrackAt?: Date | null;
  notes?: string | null;
  // T9.5/ADR-038 pattern: required, no default. §3's own example — a
  // profile read straight off the roaster's software is not the same
  // reliability as one recalled that evening.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function recordRoastSession(userAccountId: string, input: RecordRoastSessionInput) {
  const sourceLot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!sourceLot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification }]);

  if (input.endedAt && input.endedAt < input.startedAt) {
    throw new RoastSessionValidationError("ended_before_started");
  }
  if (input.chargeWeightKg != null && input.chargeWeightKg <= 0) {
    throw new RoastSessionValidationError("charge_weight_must_be_positive");
  }
  if (
    input.chargeWeightKg != null &&
    input.dischargeWeightKg != null &&
    input.dischargeWeightKg > input.chargeWeightKg
  ) {
    throw new RoastSessionValidationError("discharge_weight_exceeds_charge_weight");
  }

  const provenanceClass = input.provenanceClass;
  const occurredAt = input.endedAt ?? input.startedAt;

  const result = await prisma.$transaction(async (tx) => {
    const roastSession = await tx.roastSession.create({
      data: {
        roastLevel: input.roastLevel ?? null,
        equipmentNote: input.equipmentNote ?? null,
        roasterPersonId: input.roasterPersonId ?? null,
        chargeWeightKg: input.chargeWeightKg ?? null,
        dischargeWeightKg: input.dischargeWeightKg ?? null,
        startedAt: input.startedAt,
        endedAt: input.endedAt ?? null,
        firstCrackAt: input.firstCrackAt ?? null,
        secondCrackAt: input.secondCrackAt ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
      },
    });

    const transformation = await tx.lotTransformation.create({
      data: {
        transformationType: "stage_change",
        occurredAt,
        operatorPersonId: input.roasterPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
        roastSessionId: roastSession.id,
        provenanceClass,
        sourceReference: input.sourceReference ?? null,
        inputs: {
          create: [
            {
              lotId: input.lotId,
              quantity: input.chargeWeightKg ?? null,
              unit: input.chargeWeightKg != null ? "kg" : null,
            },
          ],
        },
      },
    });

    const outputLot = await tx.lot.create({
      data: {
        lotCode: input.outputLotCode,
        lotType: "roast",
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
        quantity: input.dischargeWeightKg ?? null,
        unit: input.dischargeWeightKg != null ? "kg" : null,
      },
    });

    // Same fix as T1's recordTransformation/T6's endFermentationRun: seed
    // the output lot's own quantity ledger so computeCurrentQuantity
    // reports correctly for it from creation.
    if (input.dischargeWeightKg != null) {
      await tx.quantityEvent.create({
        data: {
          lotId: outputLot.id,
          eventType: "process_output",
          quantity: input.dischargeWeightKg,
          unit: "kg",
          occurredAt,
          transformationId: transformation.id,
          createdBy: userAccountId,
          provenanceClass,
          sourceReference: input.sourceReference ?? null,
        },
      });
    }

    return { roastSession, transformation, outputLot };
  });

  // C1 §3 pattern: an evidentiary write — the earlier gap where T6/T7's
  // own start/end functions were never audited is not repeated here.
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "roast_session.create",
    entityType: "roast_session",
    entityId: result.roastSession.id,
    after: result.roastSession,
    sourceInterface: "traceability.service",
  });

  return result;
}

export interface RoastSessionFilter {
  roastLevel?: string | null;
  roasterPersonId?: string | null;
}

/**
 * §4.1/§4.2's own requirement: queryable by profile and by roaster, not
 * just by lot code. Visibility resolves through each session's own source
 * lot (via its transformation's input), the same mechanism getLotList
 * already uses — a RoastSession carries no project/location of its own.
 */
export async function listRoastSessions(userAccountId: string, filter: RoastSessionFilter = {}) {
  const visibility = await resolveLotVisibility(userAccountId, "view");
  if (visibility.mode === "none") return [];

  const sessions = await prisma.roastSession.findMany({
    where: {
      ...(filter.roastLevel ? { roastLevel: filter.roastLevel } : {}),
      ...(filter.roasterPersonId ? { roasterPersonId: filter.roasterPersonId } : {}),
    },
    include: {
      roaster: true,
      transformations: {
        include: {
          inputs: { include: { lot: true } },
          outputs: { include: { lot: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
    take: 200,
  });

  if (visibility.mode === "all") return sessions;
  return sessions.filter((session) =>
    session.transformations.some((t) => t.inputs.some((i) => lotMatchesVisibility(i.lot, visibility))),
  );
}

export async function getRoastSessionDetail(userAccountId: string, roastSessionId: string) {
  const session = await prisma.roastSession.findUnique({
    where: { id: roastSessionId },
    include: {
      roaster: true,
      measurements: { orderBy: { occurredAt: "asc" } },
      transformations: {
        include: {
          inputs: { include: { lot: true } },
          outputs: { include: { lot: true } },
        },
      },
    },
  });
  if (!session) throw new TraceabilityAccessError("roast_session_not_found");

  const sourceLot = session.transformations[0]?.inputs[0]?.lot;
  if (!sourceLot) throw new TraceabilityAccessError("roast_session_not_found");
  await requireLotAccess(userAccountId, "view", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification }]);

  return session;
}
