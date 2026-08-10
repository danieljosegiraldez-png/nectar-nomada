/**
 * Phase 1, ticket T1 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §8, §34). Canonical Lot + LotTransformation — the mechanism underneath
 * DOMAIN_MODEL.md §4's Agricultural Traceability chain, reconciling it with
 * COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md §F's already-approved design.
 *
 * Append-only by construction: there is deliberately no `updateLot` or
 * `updateLotTransformation` function in this file. A correction is always a
 * new LotTransformation, never an edit to an existing one — the same
 * principle already proven for sensory.Assessment and
 * SensoryProtocolVersion elsewhere in this codebase (execution plan §8.2).
 *
 * RBAC: Farm Operator Assignments may be scoped to `project` or `location`
 * (execution plan §26 decision record) — a *location*-scoped Assignment only
 * authorizes an action against a Lot if the Lot itself resolves to that
 * location (RBAC.md §3's leaf-scope containment rule), so every check here
 * tries every scope target a Lot actually carries (project, location),
 * never just one.
 */
import { prisma } from "../db";
import { can } from "../rbac/service";
import type { ScopeTarget } from "../rbac/types";

export class TraceabilityAccessError extends Error {}

/** Every concrete scope target a Lot (or a to-be-created Lot's parent context) resolves against — never just one. */
export function scopeTargetsFor(input: { projectId?: string | null; locationId?: string | null }): ScopeTarget[] {
  const targets: ScopeTarget[] = [];
  if (input.projectId) targets.push({ scopeType: "project", scopeRefId: input.projectId });
  if (input.locationId) targets.push({ scopeType: "location", scopeRefId: input.locationId });
  // A Lot with neither is only manageable platform-wide — `can()` already
  // resolves a Platform Admin's assignment against any concrete target, but
  // with no project/location to point at, the only target left to check is
  // platform scope itself.
  if (targets.length === 0) targets.push({ scopeType: "platform", scopeRefId: null });
  return targets;
}

export async function requireLotAccess(
  userAccountId: string,
  action: "manage" | "view",
  candidates: ReadonlyArray<{ projectId?: string | null; locationId?: string | null }>,
) {
  for (const candidate of candidates) {
    for (const target of scopeTargetsFor(candidate)) {
      if (await can(userAccountId, action, "lot", target)) return;
    }
  }
  throw new TraceabilityAccessError("no_lot_access");
}

export interface CreateLotInput {
  lotCode: string;
  lotType: "cherry" | "processing" | "drying" | "green" | "roast" | "sample" | "other";
  organizationId?: string | null;
  projectId?: string | null;
  locationId?: string | null;
}

export async function createLot(userAccountId: string, input: CreateLotInput) {
  await requireLotAccess(userAccountId, "manage", [input]);

  return prisma.lot.create({
    data: {
      lotCode: input.lotCode,
      lotType: input.lotType,
      organizationId: input.organizationId ?? null,
      projectId: input.projectId ?? null,
      locationId: input.locationId ?? null,
      createdBy: userAccountId,
    },
  });
}

export interface RecordTransformationInput {
  transformationType:
    | "split"
    | "merge"
    | "blend"
    | "stage_change"
    | "sample_extraction"
    | "loss"
    | "disposal"
    | "sale";
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
  inputs: ReadonlyArray<{ lotId: string; quantity?: number | null; unit?: string | null }>;
  // New Lot(s) this transformation produces — every LotTransformation output
  // is a freshly created Lot row (execution plan §8.1's lineage diagram: a
  // stage change, a split, a merge all produce a *new* node, never mutate an
  // existing one), never a reference to a pre-existing Lot. Empty for
  // loss/disposal/sale, and for sample_extraction in this ticket (Sample
  // creation is T5, not T1 — the transformation record itself is still
  // valid with zero Lot outputs).
  outputs: ReadonlyArray<{
    lotCode: string;
    lotType: CreateLotInput["lotType"];
    quantity?: number | null;
    unit?: string | null;
  }>;
}

/**
 * Creates a LotTransformation plus its input rows (referencing existing
 * Lots) and output rows (each backed by a brand-new Lot), atomically. RBAC
 * is checked against every *input* Lot's own project/location scope — an
 * operator must have manage access to at least one of the lots actually
 * being transformed; newly-created outputs inherit no independent scope
 * requirement of their own since they don't exist until this call succeeds.
 */
export async function recordTransformation(userAccountId: string, input: RecordTransformationInput) {
  if (input.inputs.length === 0) {
    throw new TraceabilityAccessError("inputs_required");
  }

  const inputLots = await prisma.lot.findMany({
    where: { id: { in: input.inputs.map((i) => i.lotId) } },
  });
  if (inputLots.length !== new Set(input.inputs.map((i) => i.lotId)).size) {
    throw new TraceabilityAccessError("lot_not_found");
  }

  await requireLotAccess(
    userAccountId,
    "manage",
    inputLots.map((lot) => ({ projectId: lot.projectId, locationId: lot.locationId })),
  );

  return prisma.$transaction(async (tx) => {
    const transformation = await tx.lotTransformation.create({
      data: {
        transformationType: input.transformationType,
        occurredAt: input.occurredAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
        inputs: {
          create: input.inputs.map((i) => ({
            lotId: i.lotId,
            quantity: i.quantity ?? null,
            unit: i.unit ?? null,
          })),
        },
      },
    });

    // Inherit the first input lot's project/location/organization context —
    // the same farm/plot a material came from, unless a future ticket needs
    // to model a genuine cross-project transfer explicitly. Guaranteed to
    // exist: input.inputs.length was checked non-zero above, and inputLots
    // was verified to match that count.
    const sourceLot = inputLots[0]!;

    const outputLots = [];
    for (const output of input.outputs) {
      const outputLot = await tx.lot.create({
        data: {
          lotCode: output.lotCode,
          lotType: output.lotType,
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
          quantity: output.quantity ?? null,
          unit: output.unit ?? null,
        },
      });
      // Seed the new lot's own quantity ledger so computeCurrentQuantity
      // (lib/traceability/quantity.ts) reports correctly for it from
      // creation, not just for lots created by HarvestEvent/ReceivingEvent
      // — LotTransformationOutput.quantity was previously only a snapshot
      // on the join row, disconnected from SUM(QuantityEvent). Skipped
      // when quantity isn't given, same "missing stays missing" rule as
      // everywhere else.
      if (output.quantity != null && output.unit) {
        await tx.quantityEvent.create({
          data: {
            lotId: outputLot.id,
            eventType: "process_output",
            quantity: output.quantity,
            unit: output.unit,
            occurredAt: input.occurredAt,
            transformationId: transformation.id,
            createdBy: userAccountId,
          },
        });
      }
      outputLots.push(outputLot);
    }

    return { transformation, outputLots };
  });
}

/**
 * Both directions of lineage, via recursive CTEs — "where did this come
 * from" (ancestors, walking output → input backward) and "what did this
 * become" (descendants, walking input → output forward). Execution plan
 * §8.3: no graph database needed, ordinary recursive SQL over the
 * input/output join tables.
 */
export async function getLotLineage(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");

  await requireLotAccess(userAccountId, "view", [{ projectId: lot.projectId, locationId: lot.locationId }]);

  const ancestors = await prisma.$queryRaw<Array<{ lot_id: string; depth: number }>>`
    WITH RECURSIVE ancestry AS (
      SELECT lto.lot_id AS output_lot_id, lti.lot_id AS input_lot_id, 0 AS depth
      FROM traceability.lot_transformation_output lto
      JOIN traceability.lot_transformation_input lti ON lti.transformation_id = lto.transformation_id
      WHERE lto.lot_id = ${lotId}::uuid
      UNION ALL
      SELECT lto.lot_id, lti.lot_id, ancestry.depth + 1
      FROM ancestry
      JOIN traceability.lot_transformation_output lto ON lto.lot_id = ancestry.input_lot_id
      JOIN traceability.lot_transformation_input lti ON lti.transformation_id = lto.transformation_id
    )
    SELECT DISTINCT input_lot_id AS lot_id, depth FROM ancestry ORDER BY depth ASC;
  `;

  const descendants = await prisma.$queryRaw<Array<{ lot_id: string; depth: number }>>`
    WITH RECURSIVE descent AS (
      SELECT lti.lot_id AS input_lot_id, lto.lot_id AS output_lot_id, 0 AS depth
      FROM traceability.lot_transformation_input lti
      JOIN traceability.lot_transformation_output lto ON lto.transformation_id = lti.transformation_id
      WHERE lti.lot_id = ${lotId}::uuid
      UNION ALL
      SELECT lti.lot_id, lto.lot_id, descent.depth + 1
      FROM descent
      JOIN traceability.lot_transformation_input lti ON lti.lot_id = descent.output_lot_id
      JOIN traceability.lot_transformation_output lto ON lto.transformation_id = lti.transformation_id
    )
    SELECT DISTINCT output_lot_id AS lot_id, depth FROM descent ORDER BY depth ASC;
  `;

  return {
    lot,
    ancestorLotIds: ancestors.map((r) => r.lot_id),
    descendantLotIds: descendants.map((r) => r.lot_id),
  };
}
