-- P3 — selección (docs/implementation/44_P3_SELECTION.md).
--
-- Additive: one enum value, three nullable columns, no backfill.

-- Cherry sorting as a material operation: one input, an accepted output and one
-- output per rejection stream. Registered in balance.ts's CONSERVING_TYPES, so
-- accepted + rejected + declared loss must reconcile against the input — the
-- first transformation where a gap means a real discrepancy rather than a yield.
ALTER TYPE "traceability"."LotTransformationType" ADD VALUE 'selection';

-- Only meaningful for transformationType 'selection'. equipment_note stays free
-- text, matching fermentation_run.vessel_note: no Equipment entity exists yet.
ALTER TABLE "traceability"."lot_transformation"
  ADD COLUMN "selection_method_value_id" UUID,
  ADD COLUMN "equipment_note"            TEXT;

CREATE INDEX "lot_transformation_selection_method_value_id_idx"
  ON "traceability"."lot_transformation"("selection_method_value_id");

ALTER TABLE "traceability"."lot_transformation"
  ADD CONSTRAINT "lot_transformation_selection_method_value_id_fkey"
  FOREIGN KEY ("selection_method_value_id")
  REFERENCES "research"."variable_catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Why this lot was rejected, when it was.
--
-- Deliberately NOT a new lot_type value, diverging from the audit's §25:
-- lot_type describes the material's *stage*, and a lot of floaters is
-- physically still cherry while a rejected parchment is still parchment.
-- Folding a quality judgement into the stage enum would make it mean two things
-- at once and could not express rejection at a later stage at all. Stage and
-- quality are two axes, the same separation data_quality has from status.
--
-- Null for every ordinary lot; its presence marks a rejection stream — which
-- can still be stored, sold or reprocessed, since not every rejection is waste.
ALTER TABLE "traceability"."lot"
  ADD COLUMN "rejection_category_value_id" UUID;

CREATE INDEX "lot_rejection_category_value_id_idx"
  ON "traceability"."lot"("rejection_category_value_id");

ALTER TABLE "traceability"."lot"
  ADD CONSTRAINT "lot_rejection_category_value_id_fkey"
  FOREIGN KEY ("rejection_category_value_id")
  REFERENCES "research"."variable_catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;
