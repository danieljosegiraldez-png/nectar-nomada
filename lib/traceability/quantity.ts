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
import { Prisma } from "../../generated/prisma/client";
import type { ProvenanceClass } from "../../generated/prisma/client";

export class QuantityValidationError extends Error {}

const ADDITIVE_EVENT_TYPES = new Set(["received", "process_output", "transfer_in", "adjustment_increase"]);
const SUBTRACTIVE_EVENT_TYPES = new Set(["loss", "sample_removed", "transfer_out", "adjustment_decrease"]);

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

  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId }]);

  return prisma.quantityEvent.create({
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
}

export interface CurrentQuantity {
  quantity: Prisma.Decimal;
  unit: string | null;
}

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

  await requireLotAccess(userAccountId, "view", [{ projectId: lot.projectId, locationId: lot.locationId }]);

  const events = await prisma.quantityEvent.findMany({ where: { lotId } });
  if (events.length === 0) {
    return { quantity: new Prisma.Decimal(0), unit: null };
  }

  const unit = events[0]!.unit;
  if (events.some((e) => e.unit !== unit)) {
    throw new QuantityValidationError("mixed_units");
  }

  let total = new Prisma.Decimal(0);
  for (const event of events) {
    if (ADDITIVE_EVENT_TYPES.has(event.eventType)) {
      total = total.add(event.quantity);
    } else if (SUBTRACTIVE_EVENT_TYPES.has(event.eventType)) {
      total = total.sub(event.quantity);
    }
  }

  return { quantity: total, unit };
}
