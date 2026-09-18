/**
 * P0 (docs/implementation/41_P0_MASS_BALANCE.md) — the input side of the
 * quantity ledger, and the tolerance/deviation machinery around it.
 *
 * The bug this closes: `recordTransformation` and the three `end*` functions
 * each created a `process_output` QuantityEvent for their outputs and **never
 * decremented their inputs**. No code path anywhere produced `transfer_out`,
 * `loss` or `adjustment_decrease` (only `samples.ts` was correct, with
 * `sample_removed`). So after every split, merge, blend and stage change the
 * parent lot still reported its full quantity while the children reported
 * theirs, and `getLotReport` compounded that across ancestry rather than
 * cancelling it.
 *
 * This is a **leaf module by design**: it imports nothing from `lots.ts` or
 * `quantity.ts`, both of which import it. `quantity.ts` needs
 * `requireLotAccess` from `lots.ts`, so putting the shared summation here
 * (rather than in `quantity.ts`, its more obvious home) is what keeps
 * lots → balance and quantity → balance acyclic.
 *
 * Everything here is RBAC-free on purpose. Callers have already resolved
 * access against the input lots before they get this far, and re-checking
 * inside a transaction would be both redundant and a second place for the
 * policy to drift.
 */
import { Prisma } from "../../generated/prisma/client";
import type {
  LotTransformationType,
  ProvenanceClass,
  QuantityEventType,
} from "../../generated/prisma/client";

export class MassBalanceError extends Error {}

/**
 * Fallback when an Organization has not set `massBalanceTolerancePct`.
 *
 * 2% of input mass. Chosen to be loose enough that ordinary field practice
 * clears it — a platform scale read to the nearest 100 g on a 45 kg batch is
 * already 0.2% before anyone estimates anything — and tight enough that a
 * whole missing bag does not. It is a starting value, not a claim about
 * coffee: the column exists precisely so a farm that knows its own scales can
 * say so.
 */
export const DEFAULT_MASS_BALANCE_TOLERANCE_PCT = new Prisma.Decimal("2.00");

/** Event types that add to a lot's running total. */
export const ADDITIVE_EVENT_TYPES: ReadonlySet<QuantityEventType> = new Set([
  "received",
  "process_output",
  "transfer_in",
  "adjustment_increase",
] as const);

/** Event types that subtract from it. */
export const SUBTRACTIVE_EVENT_TYPES: ReadonlySet<QuantityEventType> = new Set([
  "loss",
  "sample_removed",
  "transfer_out",
  "adjustment_decrease",
] as const);

/**
 * A transformation type whose inputs cease to exist as themselves — the whole
 * lot goes in. The decrement is therefore the input lot's *entire current
 * balance*, which matters more than it sounds: 9 of 10 transformation inputs
 * in real data carry a NULL quantity, so "decrement by the declared input
 * quantity" is not implementable for almost any of them. The balance is
 * knowable exactly when the declaration is not.
 */
const FULL_CONSUMPTION_TYPES: ReadonlySet<LotTransformationType> = new Set([
  "stage_change",
  "merge",
  "blend",
  "loss",
  "disposal",
  "sale",
] as const);

// P3 — `selection` is deliberately absent from FULL_CONSUMPTION_TYPES, so it
// takes the partial path and an explicit input quantity is required. A
// selection whose input was never weighed cannot reconcile against anything,
// and the outturn is the entire point of the operation.

/**
 * Types that legitimately produce no output Lot yet still consume material.
 * Everything else with zero outputs is a marker, not a movement — see
 * `movesMaterial`.
 */
const CONSUMING_WITHOUT_OUTPUT: ReadonlySet<LotTransformationType> = new Set([
  "loss",
  "disposal",
  "sale",
] as const);

/**
 * Types where mass **should** be conserved, and a difference is therefore
 * suspicious. Only these are reconciled against a tolerance.
 *
 * This distinction is not in 41_P0_MASS_BALANCE.md §4 and is a correction to
 * it, made during implementation. Reconciling *every* material-moving
 * transformation looks right until you apply it to a `stage_change`: cherry
 * to parchment loses roughly four fifths of its mass, and that loss is the
 * **yield**, the single most valuable number a mill computes. Treating it as
 * an unexplained discrepancy would raise a Deviation on every correctly
 * recorded depulping — a tolerance breach on virtually every row, which is
 * how an alarm gets ignored and then switched off.
 *
 * A split, merge or blend is different in kind: it re-partitions material
 * without transforming it, so the masses genuinely must add up, and a gap
 * means someone mis-weighed or material went missing. That is worth stopping
 * for. It is also exactly the shape the Phase 3 selection operation has
 * (accepted + rejected + declared loss = input), so the machinery lands where
 * it was actually needed.
 *
 * Yield across a stage change stays fully derivable — the input decrement and
 * the output credit are both in the ledger — it is simply reported rather
 * than alarmed on.
 */
const CONSERVING_TYPES: ReadonlySet<LotTransformationType> = new Set([
  "split",
  "merge",
  "blend",
  // P3 (44_P3_SELECTION.md §1). Selection is conserving by definition:
  // accepted + rejected + declared loss = input. It is the operation this
  // whole reconciliation path was built for — the first transformation where
  // a gap means someone mis-weighed or material went missing, rather than a
  // yield. Everything before it either re-partitioned material (split/merge/
  // blend) or transformed it (stage_change, deliberately excluded).
  "selection",
  // La trilla conserva por diseño: verde + cascarilla + merma declarada suman
  // la entrada, y **todo vuelve a la finca** — ninguna de las tres formas de
  // trillar (Cafelino, Kiva Estate, o mazo y pilón en Las Nubes) se queda con
  // material. Si esto saliera de aquí, cada trilla pasaría con un hueco del
  // ~18 %, que es la cascarilla, leído como rendimiento normal.
  "hulling",
  // ADR-161. Procesar y envasar miel conservan: la miel que sale más la merma declarada
  // (cera y residuos al colar; lo que queda en el tanque al envasar) suman la que entró.
  // Un hueco aquí es miel que nadie sabe dónde está, no un rendimiento.
  "honey_processing",
  "packaging",
] as const);

/** Whether a difference between input and output mass is suspicious for this type. */
export function conservesMass(transformationType: LotTransformationType): boolean {
  return CONSERVING_TYPES.has(transformationType);
}

/**
 * **The trap this whole module exists to avoid getting wrong.**
 *
 * `startFermentationRun` and `startDryingRun` create a `stage_change`
 * LotTransformation with one input and **zero outputs** — a marker recording
 * that the lot entered the stage. Nothing has been converted yet; the coffee
 * is sitting in the tank. `endFermentationRun`/`endDryingRun` then create a
 * *second* `stage_change` with the same input and one output, and that is the
 * one that actually converts material.
 *
 * Decrementing on both would zero the lot the moment fermentation starts and
 * then decrement it again at the end — a bug that would look like the fix
 * working (numbers went down!) while destroying the ledger.
 *
 * `sample_extraction` returns false because `samples.ts` already writes its
 * own `sample_removed` event; decrementing here too would double-count in the
 * other direction.
 */
export function movesMaterial(input: {
  transformationType: LotTransformationType;
  outputCount: number;
}): boolean {
  if (input.transformationType === "sample_extraction") return false;
  if (input.outputCount > 0) return true;
  return CONSUMING_WITHOUT_OUTPUT.has(input.transformationType);
}

export interface LotBalance {
  quantity: Prisma.Decimal;
  unit: string | null;
  /**
   * Whether any QuantityEvent exists at all (ADR-080). "Never weighed" and
   * "weighed, and currently zero" are different claims and must stay
   * different — a lot fully consumed genuinely *is* zero.
   */
  recorded: boolean;
}

/** Sums an already-loaded event list. Throws on mixed units — no conversion. */
export function sumQuantityEvents(
  events: ReadonlyArray<{ eventType: QuantityEventType; quantity: Prisma.Decimal; unit: string }>,
): LotBalance {
  if (events.length === 0) return { quantity: new Prisma.Decimal(0), unit: null, recorded: false };

  const unit = events[0]!.unit;
  if (events.some((e) => e.unit !== unit)) throw new MassBalanceError("mixed_units");

  let total = new Prisma.Decimal(0);
  for (const event of events) {
    if (ADDITIVE_EVENT_TYPES.has(event.eventType)) total = total.add(event.quantity);
    else if (SUBTRACTIVE_EVENT_TYPES.has(event.eventType)) total = total.sub(event.quantity);
  }
  return { quantity: total, unit, recorded: true };
}

/**
 * A lot's current balance, RBAC-free and transaction-safe. `client` accepts
 * either the base PrismaClient or a `$transaction` client — the decrements
 * below must read balances inside the same transaction that writes them, or
 * two concurrent transformations on one lot would both read the pre-decrement
 * figure.
 */
export async function computeLotBalance(
  client: Prisma.TransactionClient,
  lotId: string,
): Promise<LotBalance> {
  const events = await client.quantityEvent.findMany({
    where: { lotId },
    select: { eventType: true, quantity: true, unit: true },
  });
  return sumQuantityEvents(events);
}

export interface DecrementInput {
  lotId: string;
  /** The operator's declared quantity, if they gave one. Required for `split`. */
  quantity?: number | null;
  unit?: string | null;
}

export interface ApplyDecrementsResult {
  /** Total material consumed from all inputs, in `unit`. */
  inputTotal: Prisma.Decimal;
  unit: string | null;
  /**
   * True when at least one input lot had no ledger at all. The transformation
   * is still valid and still recorded — its lineage is true — but no
   * unexplained difference can be computed, because one of the terms is
   * genuinely unknown rather than zero.
   */
  hasUnledgeredInput: boolean;
  decrementCount: number;
}

/**
 * Writes the missing half of the ledger: one subtractive QuantityEvent per
 * input lot, inside the caller's transaction.
 *
 * `LotTransformationInput.quantity` is deliberately **not** back-filled with
 * the computed decrement. That column records what the operator declared —
 * often nothing — and the ledger records what actually moved. Collapsing the
 * two would destroy the ability to notice that they disagree, which is
 * exactly the signal a mass-balance review is looking for.
 */
export async function applyInputDecrements(
  tx: Prisma.TransactionClient,
  args: {
    transformationId: string;
    transformationType: LotTransformationType;
    inputs: ReadonlyArray<DecrementInput>;
    occurredAt: Date;
    provenanceClass: ProvenanceClass;
    sourceReference?: string | null;
    createdBy: string;
  },
): Promise<ApplyDecrementsResult> {
  const fullConsumption = FULL_CONSUMPTION_TYPES.has(args.transformationType);

  let inputTotal = new Prisma.Decimal(0);
  let unit: string | null = null;
  let hasUnledgeredInput = false;
  let decrementCount = 0;

  for (const input of args.inputs) {
    const balance = await computeLotBalance(tx, input.lotId);

    // No ledger at all: write nothing. Inventing a zero event here would
    // convert "never weighed" into "weighed and empty" — the precise
    // distinction ADR-080 exists to preserve.
    if (!balance.recorded) {
      hasUnledgeredInput = true;
      continue;
    }

    let amount: Prisma.Decimal;
    let eventUnit: string;

    if (fullConsumption) {
      amount = balance.quantity;
      eventUnit = balance.unit!;
      // A declared quantity that contradicts the ledger is worth refusing
      // rather than silently preferring one of them.
      if (input.unit != null && input.unit !== eventUnit) {
        throw new MassBalanceError("mixed_units");
      }
    } else {
      // `split` and anything else partial: we cannot infer how much of a lot
      // was taken, so the caller must say.
      if (input.quantity == null || !input.unit) {
        throw new MassBalanceError("input_quantity_required");
      }
      if (balance.unit !== input.unit) throw new MassBalanceError("mixed_units");
      amount = new Prisma.Decimal(input.quantity);
      eventUnit = input.unit;
      if (amount.greaterThan(balance.quantity)) {
        throw new MassBalanceError("input_exceeds_available");
      }
    }

    if (unit == null) unit = eventUnit;
    else if (unit !== eventUnit) throw new MassBalanceError("mixed_units");

    // A lot already at zero needs no event — writing a 0 kg transfer_out adds
    // a row that says nothing.
    if (amount.isZero()) continue;

    await tx.quantityEvent.create({
      data: {
        lotId: input.lotId,
        eventType: "transfer_out",
        quantity: amount,
        unit: eventUnit,
        occurredAt: args.occurredAt,
        transformationId: args.transformationId,
        createdBy: args.createdBy,
        // Same reliability as the transformation that caused it — this event
        // is not an independent observation, it is the bookkeeping
        // consequence of one.
        provenanceClass: args.provenanceClass,
        sourceReference: args.sourceReference ?? null,
      },
    });

    inputTotal = inputTotal.add(amount);
    decrementCount++;
  }

  return { inputTotal, unit, hasUnledgeredInput, decrementCount };
}

export interface ReconciliationInput {
  inputTotal: Prisma.Decimal;
  hasUnledgeredInput: boolean;
  outputs: ReadonlyArray<{ quantity?: number | null; unit?: string | null }>;
  declaredLossQuantity?: number | null;
  declaredLossUnit?: string | null;
  unit: string | null;
  tolerancePct: Prisma.Decimal;
}

export interface Reconciliation {
  /** Σinputs − Σoutputs − declaredLoss. NULL when a term is genuinely unknown. */
  unexplained: Prisma.Decimal | null;
  withinTolerance: boolean;
  toleranceAmount: Prisma.Decimal | null;
}

/**
 * Reconciles a transformation. Returns `unexplained: null` — not zero —
 * whenever a term is unknown: an input with no ledger, or outputs with no
 * declared quantities. An unknown difference is not a balanced one, and
 * reporting it as zero would be the same category of lie the pre-P0 ledger
 * was already telling.
 */
export function reconcile(args: ReconciliationInput): Reconciliation {
  if (args.hasUnledgeredInput || args.unit == null) {
    return { unexplained: null, withinTolerance: true, toleranceAmount: null };
  }

  let outputTotal = new Prisma.Decimal(0);
  let sawOutputQuantity = false;
  for (const output of args.outputs) {
    if (output.quantity == null || !output.unit) continue;
    if (output.unit !== args.unit) throw new MassBalanceError("mixed_units");
    outputTotal = outputTotal.add(new Prisma.Decimal(output.quantity));
    sawOutputQuantity = true;
  }

  // Outputs exist but none was weighed — the difference is unknown, not zero.
  if (args.outputs.length > 0 && !sawOutputQuantity) {
    return { unexplained: null, withinTolerance: true, toleranceAmount: null };
  }

  let declaredLoss = new Prisma.Decimal(0);
  if (args.declaredLossQuantity != null) {
    if (args.declaredLossUnit && args.declaredLossUnit !== args.unit) {
      throw new MassBalanceError("mixed_units");
    }
    declaredLoss = new Prisma.Decimal(args.declaredLossQuantity);
  }

  const unexplained = args.inputTotal.sub(outputTotal).sub(declaredLoss);
  const toleranceAmount = args.inputTotal.mul(args.tolerancePct).div(100).abs();

  return {
    unexplained,
    withinTolerance: unexplained.abs().lessThanOrEqualTo(toleranceAmount),
    toleranceAmount,
  };
}

/** Resolves an organization's tolerance, falling back to the platform default. */
export function resolveTolerancePct(
  organization: { massBalanceTolerancePct: Prisma.Decimal | null } | null,
): Prisma.Decimal {
  return organization?.massBalanceTolerancePct ?? DEFAULT_MASS_BALANCE_TOLERANCE_PCT;
}

export interface SettleResult {
  unexplained: Prisma.Decimal | null;
  withinTolerance: boolean;
  deviationId: string | null;
  decrementCount: number;
}

/**
 * The single entry point all four transformation write paths share —
 * `recordTransformation`, `endFermentationRun`, `endDryingRun` and
 * `createRoastSession`. The pre-P0 defect was present at every one of them
 * because each had copied T1's output-only pattern; a fix applied four times
 * would drift four ways, so there is exactly one implementation and the call
 * sites pass their shape to it.
 *
 * Returns `null` for a transformation that does not move material, having
 * written nothing.
 *
 * Note on declared loss: it gets **no QuantityEvent of its own**. Under full
 * consumption the input lot is already decremented to zero, so the loss is
 * accounted for by the gap between what left the input and what reached the
 * outputs. A separate `loss` event would subtract it twice.
 */
export async function settleMassBalance(
  tx: Prisma.TransactionClient,
  args: {
    transformationId: string;
    transformationType: LotTransformationType;
    organizationId: string;
    inputs: ReadonlyArray<DecrementInput>;
    outputs: ReadonlyArray<{ quantity?: number | null; unit?: string | null }>;
    occurredAt: Date;
    provenanceClass: ProvenanceClass;
    sourceReference?: string | null;
    createdBy: string;
    declaredLossQuantity?: number | null;
    declaredLossUnit?: string | null;
    declaredLossReason?: string | null;
    acceptUnexplained?: { reason: string } | null;
  },
): Promise<SettleResult | null> {
  if (!movesMaterial({ transformationType: args.transformationType, outputCount: args.outputs.length })) {
    return null;
  }

  const decrements = await applyInputDecrements(tx, {
    transformationId: args.transformationId,
    transformationType: args.transformationType,
    inputs: args.inputs,
    occurredAt: args.occurredAt,
    provenanceClass: args.provenanceClass,
    sourceReference: args.sourceReference ?? null,
    createdBy: args.createdBy,
  });

  // Decrements are universal — that is the actual bug being fixed. Only the
  // reconciliation is conditional: a stage change legitimately loses mass and
  // that loss is the yield, not a discrepancy. See CONSERVING_TYPES.
  if (!conservesMass(args.transformationType)) {
    if (args.declaredLossQuantity != null || args.declaredLossReason != null) {
      await tx.lotTransformation.update({
        where: { id: args.transformationId },
        data: {
          declaredLossQuantity: args.declaredLossQuantity ?? null,
          declaredLossUnit: args.declaredLossUnit ?? null,
          declaredLossReason: args.declaredLossReason ?? null,
        },
      });
    }
    return {
      unexplained: null,
      withinTolerance: true,
      deviationId: null,
      decrementCount: decrements.decrementCount,
    };
  }

  const organization = await tx.organization.findUnique({
    where: { id: args.organizationId },
    select: { massBalanceTolerancePct: true },
  });

  const reconciliation = reconcile({
    inputTotal: decrements.inputTotal,
    hasUnledgeredInput: decrements.hasUnledgeredInput,
    outputs: args.outputs,
    declaredLossQuantity: args.declaredLossQuantity ?? null,
    declaredLossUnit: args.declaredLossUnit ?? null,
    unit: decrements.unit,
    tolerancePct: resolveTolerancePct(organization),
  });

  await tx.lotTransformation.update({
    where: { id: args.transformationId },
    data: {
      declaredLossQuantity: args.declaredLossQuantity ?? null,
      declaredLossUnit: args.declaredLossUnit ?? null,
      declaredLossReason: args.declaredLossReason ?? null,
      unexplainedQuantity: reconciliation.unexplained,
    },
  });

  let deviationId: string | null = null;
  if (!reconciliation.withinTolerance && reconciliation.unexplained != null) {
    const deviation = await tx.deviation.create({
      data: {
        lotTransformationId: args.transformationId,
        description:
          `Mass balance out of tolerance: ${reconciliation.unexplained.toString()} ${decrements.unit ?? ""} ` +
          `unexplained against an input of ${decrements.inputTotal.toString()} ` +
          `(tolerance ±${reconciliation.toleranceAmount?.toString() ?? "?"}).`,
        occurredAt: args.occurredAt,
        severity: "mass_balance",
        createdBy: args.createdBy,
      },
    });
    deviationId = deviation.id;

    // The override does not suppress the Deviation — it answers it, at write
    // time, by someone authorized to. An unanswered one stays open for review.
    if (args.acceptUnexplained) {
      await tx.correctiveAction.create({
        data: {
          deviationId: deviation.id,
          actionText: `Discrepancy accepted at recording time: ${args.acceptUnexplained.reason}`,
          takenAt: new Date(),
          createdBy: args.createdBy,
        },
      });
    }
  }

  return {
    unexplained: reconciliation.unexplained,
    withinTolerance: reconciliation.withinTolerance,
    deviationId,
    decrementCount: decrements.decrementCount,
  };
}
