-- T9.5: remove the silent default. Every write path in lib/traceability/*.ts
-- now supplies provenanceClass explicitly (no `?? "direct_observation"`
-- fallback survives); the column stays NOT NULL, so the database itself
-- rejects any future insert that omits it. Safe: all five tables are empty
-- (verified against Neon before writing this migration).

-- AlterTable
ALTER TABLE "traceability"."lot_transformation" ALTER COLUMN "provenance_class" DROP DEFAULT;

-- AlterTable
ALTER TABLE "traceability"."quantity_event" ALTER COLUMN "provenance_class" DROP DEFAULT;

-- AlterTable
ALTER TABLE "traceability"."measurement" ALTER COLUMN "provenance_class" DROP DEFAULT;

-- AlterTable
ALTER TABLE "traceability"."harvest_event" ALTER COLUMN "provenance_class" DROP DEFAULT;

-- AlterTable
ALTER TABLE "traceability"."receiving_event" ALTER COLUMN "provenance_class" DROP DEFAULT;
