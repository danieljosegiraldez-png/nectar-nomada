/**
 * Phase 1, ticket T2 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §9, §34). Append-only mass/quantity ledger — a Lot's current quantity is
 * always SUM(QuantityEvent), never a stored overwritable column, same
 * principle as lib/traceability/lots.ts's LotTransformation.
 *
 * `quantity` is stored as a non-negative magnitude for every event type
 * (DB CHECK constraint + validated here); direction is derived purely from
 * `eventType`. `adjustment` is split into adjustment_increase/
 * adjustment_decrease rather than carrying a separate direction column —
 * see the schema comment on QuantityEventType for why.
 */
import { prisma } from "../db";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { recordAuditEvent } from "../audit";
import { Prisma } from "../../generated/prisma/client";
import type { ProvenanceClass } from "../../generated/prisma/client";
// P0: the additive/subtractive vocabulary and the summation itself now live
// in balance.ts, so the transformation write path and this function cannot
// drift on what "current quantity" means. They previously could not drift
// only because one of them did not exist.
import { computeLotBalance, MassBalanceError, type LotBalance } from "./balance";

export class QuantityValidationError extends Error {}

export interface RecordQuantityEventInput {
  lotId: string;
  eventType:
    | "received"
    | "process_output"
    | "loss"
    | "sample_removed"
    | "adjustment_increase"
    | "adjustment_decrease"
    | "transfer_in"
    | "transfer_out";
  quantity: number;
  unit: string;
  occurredAt: Date;
  transformationId?: string | null;
  notes?: string | null;
  // T9.5: required, no fallback — see lots.ts's RecordTransformationInput
  // comment. eventType alone doesn't determine a correct default (a
  // "received" event could be a scale reading or a delivery-note figure).
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function recordQuantityEvent(userAccountId: string, input: RecordQuantityEventInput) {
  if (input.quantity < 0) {
    throw new QuantityValidationError("negative_quantity");
  }

  const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");

  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);

  const quantityEvent = await prisma.quantityEvent.create({
    data: {
      lotId: input.lotId,
      eventType: input.eventType,
      quantity: input.quantity,
      unit: input.unit,
      occurredAt: input.occurredAt,
      transformationId: input.transformationId ?? null,
      notes: input.notes ?? null,
      createdBy: userAccountId,
      provenanceClass: input.provenanceClass,
      sourceReference: input.sourceReference ?? null,
    },
  });

  // C1 §3: evidentiary write (carries provenanceClass).
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "quantity_event.create",
    entityType: "quantity_event",
    entityId: quantityEvent.id,
    after: quantityEvent,
    sourceInterface: "traceability.service",
  });

  return quantityEvent;
}

/**
 * Whether any QuantityEvent exists for this lot — ADR-080.
 *
 * Without `recorded`, "never recorded" and "recorded, and currently zero" are
 * the same value, and the page stated `Cantidad: 0` for a batch nobody had
 * ever weighed. CLAUDE.md §3: missing information must remain missing, never
 * inferred into a fact. A lot fully consumed genuinely *is* zero, and that is
 * a different claim worth being able to make — one that P0's decrements now
 * make routinely true for consumed parent lots.
 */
export type CurrentQuantity = LotBalance;

/**
 * Sums a lot's full QuantityEvent history — additive types add, subtractive
 * types subtract. Phase 1 assumes one canonical unit per lot's ledger (no
 * cross-unit conversion yet, per execution plan §10.3); a lot whose events
 * carry more than one unit throws rather than silently summing incompatible
 * quantities.
 */
export async function computeCurrentQuantity(userAccountId: string, lotId: string): Promise<CurrentQuantity> {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");

  await requireLotAccess(userAccountId, "view", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);

  try {
    return await computeLotBalance(prisma, lotId);
  } catch (error) {
    // Preserve this function's own error type for its existing callers — the
    // action layer matches on QuantityValidationError by class.
    if (error instanceof MassBalanceError) throw new QuantityValidationError(error.message);
    throw error;
  }
}
