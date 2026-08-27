-- P0 — mass balance (docs/implementation/41_P0_MASS_BALANCE.md).
--
-- Four things, in one migration on purpose: the lot_code uniqueness swap must
-- not leave a window where the old global constraint is gone and the new
-- scoped one is not yet present.

-- ---------------------------------------------------------------------------
-- 1. Guards. §7 requires these re-verified against real data immediately
--    before the change, not taken on faith from a document. They were 0 and 0
--    against the 2026-08-26 restore; if that has stopped being true, this
--    migration stops rather than backfilling a guessed organization.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  null_orgs   bigint;
  dup_codes   bigint;
BEGIN
  SELECT count(*) INTO null_orgs FROM "traceability"."lot" WHERE "organization_id" IS NULL;
  IF null_orgs > 0 THEN
    RAISE EXCEPTION
      'P0 migration refused: % lot row(s) have no organization_id. Assign a real owner before migrating; do not guess one.', null_orgs;
  END IF;

  SELECT count(*) INTO dup_codes FROM (
    SELECT 1 FROM "traceability"."lot" GROUP BY "organization_id", "lot_code" HAVING count(*) > 1
  ) d;
  IF dup_codes > 0 THEN
    RAISE EXCEPTION
      'P0 migration refused: % duplicate (organization_id, lot_code) pair(s) exist.', dup_codes;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. lot: organization_id required, lot_code scoped to it.
--
--    A global unique lot_code is both an offline-collision hazard (two
--    disconnected devices minting "PE-79") and a multi-tenant defect (two
--    farms cannot both number a batch "01"). Making organization_id NOT NULL
--    is what gives the scoped unique something real to scope against —
--    Postgres treats NULLs as distinct, so a nullable column would leave the
--    constraint silently unenforced for exactly the rows that most need it.
-- ---------------------------------------------------------------------------
ALTER TABLE "traceability"."lot" ALTER COLUMN "organization_id" SET NOT NULL;

DROP INDEX IF EXISTS "traceability"."lot_lot_code_key";
CREATE UNIQUE INDEX "lot_organization_id_lot_code_key"
  ON "traceability"."lot" ("organization_id", "lot_code");

-- Reliability of this lot's own quantity record. Set to 'conflicting' on the
-- three lots the pre-P0 write path inflated (PE-79/PE-80/PE-90) — see the
-- remediation script. Absence means "no reason to doubt it", never "verified".
ALTER TABLE "traceability"."lot"
  ADD COLUMN "data_quality" "core"."DataQuality";

-- ---------------------------------------------------------------------------
-- 3. sample: same scoping, but organization_id stays nullable.
--
--    Unlike a Lot, a Sample legitimately may have no organization — the S1
--    external-coffee path exists for a green sample handed over at a fair,
--    with no lineage and an external_coffee_origin instead. NULLs being
--    distinct means this behaves as a partial index: two org-less samples
--    could share a code, which is a smaller problem than forcing an
--    organization onto a sample that genuinely has none.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "core"."sample_sample_code_key";
CREATE UNIQUE INDEX "sample_organization_id_sample_code_key"
  ON "core"."sample" ("organization_id", "sample_code");

-- ---------------------------------------------------------------------------
-- 4. Reconciliation columns.
--
--    declared_loss_* is material that leaves without becoming an output lot
--    (mucilage, water, handling). unexplained_quantity is
--    Σinputs − Σoutputs − declared_loss, computed at write time and stored:
--    it is the figure an audit asks about years later, and recomputing it from
--    a history since corrected would answer a different question. NULL when a
--    term is genuinely unknown — never 0, which would be a claim.
-- ---------------------------------------------------------------------------
ALTER TABLE "traceability"."lot_transformation"
  ADD COLUMN "declared_loss_quantity" DECIMAL(10,3),
  ADD COLUMN "declared_loss_unit"     TEXT,
  ADD COLUMN "declared_loss_reason"   TEXT,
  ADD COLUMN "unexplained_quantity"   DECIMAL(10,3);

-- How far a transformation may fail to reconcile before it raises a Deviation,
-- as a percentage of input mass. NULL falls back to the platform default in
-- lib/traceability/balance.ts. A real column rather than a key inside
-- `attributes`: a value load-bearing for a data invariant should not be
-- reachable only through an unvalidated JSON blob.
ALTER TABLE "core"."organization"
  ADD COLUMN "mass_balance_tolerance_pct" DECIMAL(5,2);

-- A third nullable parent on deviation, same ADR-020 decision 8 pattern every
-- other attachment point uses. An out-of-tolerance transformation raises one
-- of these rather than being rejected: operators estimate weights, and a field
-- tool that refuses real data stops being used.
ALTER TABLE "research"."deviation"
  ADD COLUMN "lot_transformation_id" UUID;

ALTER TABLE "research"."deviation"
  ADD CONSTRAINT "deviation_lot_transformation_id_fkey"
  FOREIGN KEY ("lot_transformation_id")
  REFERENCES "traceability"."lot_transformation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "deviation_lot_transformation_id_idx"
  ON "research"."deviation" ("lot_transformation_id");
