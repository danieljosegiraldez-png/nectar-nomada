/**
 * P3 (docs/implementation/44_P3_SELECTION.md). Cherry selection as a material
 * operation.
 *
 * What existed before was `cereza_seleccion` and `cereza_flotado` — catalog
 * values recorded as `ProcessingStageObservation` rows. Those capture what was
 * *seen* ("5-10% flotadores") and they stay valid and complementary. They
 * capture no weight, produce no material, and leave rejected coffee with no
 * existence: floaters sold as commercial grade were, to the database, not there.
 *
 * This is a thin domain wrapper over `recordTransformation`, not a parallel
 * write path. A selection already has exactly the shape the transformation
 * graph handles — one input, several typed outputs with quantities — and the
 * audit (§11) rejected a specialised `SelectionEvent` table for that reason: it
 * would need its own inputs, outputs, lineage edges and mass balance, which is
 * a second transformation system differing only in vocabulary.
 *
 * Mass balance comes free. `selection` is in `CONSERVING_TYPES`
 * (lib/traceability/balance.ts), so accepted + rejected + declared loss is
 * reconciled against the input, a gap outside the organization's tolerance
 * raises a `Deviation`, and accepting one needs `lot:override_balance`.
 */
import { prisma } from "../db";
import { recordTransformation, type CreateLotInput } from "./lots";
import type { ProvenanceClass } from "../../generated/prisma/client";

export class SelectionValidationError extends Error {}

export interface SelectionOutput {
  lotCode: string;
  /**
   * The material's **stage**, not its quality — a lot of floaters is still
   * `cherry`. What marks it as a reject is `rejectionCategoryValueId`.
   */
  lotType: CreateLotInput["lotType"];
  quantity: number;
}

export interface RejectedOutput extends SelectionOutput {
  /** A value from the `rechazo_categoria` catalog. Required — see below. */
  rejectionCategoryValueId: string;
}

export interface RecordSelectionInput {
  inputLotId: string;
  /**
   * Required, unlike most transformation inputs. `selection` takes the partial
   * consumption path in balance.ts, which refuses to guess how much of a lot
   * was taken — and a selection whose input was never weighed cannot reconcile
   * against anything, when the outturn is the entire point of the operation.
   */
  inputQuantity: number;
  unit: string;
  /** A value from the `seleccion_metodo` catalog. */
  selectionMethodValueId?: string | null;
  equipmentNote?: string | null;

  accepted: SelectionOutput;
  rejected: ReadonlyArray<RejectedOutput>;

  declaredLossQuantity?: number | null;
  declaredLossReason?: string | null;

  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  /** Requires `lot:override_balance`; never suppresses the Deviation. */
  acceptUnexplained?: { reason: string } | null;
}

/** Confirms a catalog value exists and belongs to the catalog it should. */
async function requireCatalogValue(valueId: string, catalogKey: string, errorLabel: string) {
  const value = await prisma.variableCatalogValue.findUnique({
    where: { id: valueId },
    include: { catalog: { select: { key: true } } },
  });
  if (!value) throw new SelectionValidationError(`${errorLabel}_not_found`);
  if (value.catalog.key !== catalogKey) throw new SelectionValidationError(`${errorLabel}_wrong_catalog`);
  // Resolve an alias to its canonical row, the rule ADR-095 set for cultivars:
  // otherwise reporting splits one category across two spellings.
  return value.aliasOfId ?? value.id;
}

export async function recordSelection(userAccountId: string, input: RecordSelectionInput) {
  if (input.inputQuantity <= 0) throw new SelectionValidationError("input_quantity_required");
  if (input.accepted.quantity < 0) throw new SelectionValidationError("negative_accepted_quantity");
  if (input.rejected.some((r) => r.quantity < 0)) throw new SelectionValidationError("negative_rejected_quantity");

  // A rejected lot with no reason is the thing this ticket exists to prevent:
  // it is indistinguishable from ordinary material a week later.
  for (const rejected of input.rejected) {
    if (!rejected.rejectionCategoryValueId) throw new SelectionValidationError("rejection_category_required");
  }

  const selectionMethodValueId = input.selectionMethodValueId
    ? await requireCatalogValue(input.selectionMethodValueId, "seleccion_metodo", "selection_method")
    : null;

  const rejectedResolved = await Promise.all(
    input.rejected.map(async (rejected) => ({
      ...rejected,
      rejectionCategoryValueId: await requireCatalogValue(
        rejected.rejectionCategoryValueId,
        "rechazo_categoria",
        "rejection_category",
      ),
    })),
  );

  // Lot codes must be distinct within one selection, or two outputs collide on
  // the per-organization unique index mid-transaction and the whole operation
  // fails with a constraint error rather than something an operator can read.
  const codes = [input.accepted.lotCode, ...rejectedResolved.map((r) => r.lotCode)];
  if (new Set(codes).size !== codes.length) throw new SelectionValidationError("duplicate_output_lot_codes");

  return recordTransformation(userAccountId, {
    transformationType: "selection",
    occurredAt: input.occurredAt,
    operatorPersonId: input.operatorPersonId ?? null,
    notes: input.notes ?? null,
    provenanceClass: input.provenanceClass,
    sourceReference: input.sourceReference ?? null,
    selectionMethodValueId,
    equipmentNote: input.equipmentNote ?? null,
    inputs: [{ lotId: input.inputLotId, quantity: input.inputQuantity, unit: input.unit }],
    outputs: [
      { lotCode: input.accepted.lotCode, lotType: input.accepted.lotType, quantity: input.accepted.quantity, unit: input.unit },
      ...rejectedResolved.map((rejected) => ({
        lotCode: rejected.lotCode,
        lotType: rejected.lotType,
        quantity: rejected.quantity,
        unit: input.unit,
        rejectionCategoryValueId: rejected.rejectionCategoryValueId,
      })),
    ],
    declaredLossQuantity: input.declaredLossQuantity ?? null,
    declaredLossUnit: input.declaredLossQuantity != null ? input.unit : null,
    declaredLossReason: input.declaredLossReason ?? null,
    acceptUnexplained: input.acceptUnexplained ?? null,
  });
}

/**
 * The outturn of a selection: what each stream weighed and what share of the
 * input it was.
 *
 * Percentages are computed, never stored — storing both a quantity and its
 * percentage invites the two to disagree, and the quantities are the facts.
 */
export async function getSelectionOutturn(transformationId: string) {
  const transformation = await prisma.lotTransformation.findUnique({
    where: { id: transformationId },
    include: {
      inputs: true,
      outputs: { include: { lot: { include: { rejectionCategoryValue: { select: { value: true } } } } } },
      selectionMethodValue: { select: { value: true } },
    },
  });
  if (!transformation) throw new SelectionValidationError("transformation_not_found");
  if (transformation.transformationType !== "selection") {
    throw new SelectionValidationError("not_a_selection");
  }

  const inputTotal = transformation.inputs.reduce((sum, i) => sum + Number(i.quantity ?? 0), 0);
  const share = (quantity: number) => (inputTotal > 0 ? Number(((quantity / inputTotal) * 100).toFixed(2)) : null);

  const streams = transformation.outputs.map((output) => {
    const quantity = Number(output.quantity ?? 0);
    return {
      lotId: output.lotId,
      lotCode: output.lot.lotCode,
      quantity,
      unit: output.unit,
      rejectionCategory: output.lot.rejectionCategoryValue?.value ?? null,
      isRejected: output.lot.rejectionCategoryValueId != null,
      sharePct: share(quantity),
    };
  });

  return {
    method: transformation.selectionMethodValue?.value ?? null,
    equipmentNote: transformation.equipmentNote,
    inputTotal,
    accepted: streams.filter((s) => !s.isRejected),
    rejected: streams.filter((s) => s.isRejected),
    declaredLossQuantity: transformation.declaredLossQuantity != null ? Number(transformation.declaredLossQuantity) : null,
    // Stored at write time by settleMassBalance — the figure an audit asks
    // about later, not a recomputation against since-corrected history.
    unexplainedQuantity: transformation.unexplainedQuantity != null ? Number(transformation.unexplainedQuantity) : null,
  };
}
