/**
 * Phase 1, ticket T5 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §18, §34). Extends existing Sample creation with real lot lineage.
 *
 * A sample extracted from a Lot is recorded as a LotTransformation
 * (transformationType "sample_extraction") whose input is the source Lot
 * and whose "output" is the Sample row created here, not a second Lot row
 * (§8.1's DOMAIN_MODEL.md reconciliation table) — T1's recordTransformation
 * already supports zero Lot outputs for exactly this case. When a
 * quantity/unit is given for the material taken, a matching QuantityEvent
 * ("sample_removed") is recorded against the source lot in the same
 * transaction, so T2's SUM(QuantityEvent) invariant accounts for material
 * that left the lot as a sample, not just transformations and losses.
 *
 * RBAC reuses "sample:manage" (RBAC.md §26 — "create samples from lots,
 * extends existing Sample creation, currently unguarded by any
 * lot-specific permission"), scoped against the source lot's own
 * project/location, the same leaf-scope containment check every other
 * traceability write path in this module uses.
 */
import { prisma } from "../db";
import { can } from "../rbac/service";
import { scopeTargetsFor, TraceabilityAccessError } from "./lots";
import type { ProvenanceClass } from "../../generated/prisma/client";

async function requireSampleAccess(
  userAccountId: string,
  action: "manage" | "view",
  candidates: ReadonlyArray<{ projectId?: string | null; locationId?: string | null }>,
) {
  for (const candidate of candidates) {
    for (const target of scopeTargetsFor(candidate)) {
      if (await can(userAccountId, action, "sample", target)) return;
    }
  }
  throw new TraceabilityAccessError("no_sample_access");
}

export interface CreateSampleFromLotInput {
  sampleCode: string;
  sampleType: string;
  description?: string | null;
  sourceLotId: string;
  quantity?: number | null; // amount extracted, if known
  unit?: string | null;
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required, no fallback. app/actions/traceability.ts passes
  // "original_record" — extracting a sample is an action taken against the
  // source lot, per T9.5 §3(b)'s "lot merge or transformation" example.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function createSampleFromLot(userAccountId: string, input: CreateSampleFromLotInput) {
  const sourceLot = await prisma.lot.findUnique({ where: { id: input.sourceLotId } });
  if (!sourceLot) throw new TraceabilityAccessError("lot_not_found");

  await requireSampleAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId }]);

  const provenanceClass = input.provenanceClass;

  return prisma.$transaction(async (tx) => {
    const transformation = await tx.lotTransformation.create({
      data: {
        transformationType: "sample_extraction",
        occurredAt: input.occurredAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
        provenanceClass,
        sourceReference: input.sourceReference ?? null,
        inputs: {
          create: [{ lotId: input.sourceLotId, quantity: input.quantity ?? null, unit: input.unit ?? null }],
        },
      },
    });

    const sample = await tx.sample.create({
      data: {
        sampleCode: input.sampleCode,
        sampleType: input.sampleType,
        description: input.description ?? null,
        projectId: sourceLot.projectId,
        organizationId: sourceLot.organizationId,
        locationId: sourceLot.locationId,
        sourceLotId: input.sourceLotId,
        sourceTransformationId: transformation.id,
        createdBy: userAccountId,
      },
    });

    if (input.quantity != null && input.unit) {
      await tx.quantityEvent.create({
        data: {
          lotId: input.sourceLotId,
          eventType: "sample_removed",
          quantity: input.quantity,
          unit: input.unit,
          occurredAt: input.occurredAt,
          transformationId: transformation.id,
          createdBy: userAccountId,
          provenanceClass,
          sourceReference: input.sourceReference ?? null,
        },
      });
    }

    return { transformation, sample };
  });
}
