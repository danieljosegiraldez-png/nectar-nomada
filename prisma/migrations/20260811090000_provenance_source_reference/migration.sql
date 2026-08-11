-- AlterTable
ALTER TABLE "traceability"."harvest_event" ADD COLUMN     "source_reference" TEXT;

-- AlterTable
ALTER TABLE "traceability"."lot_transformation" ADD COLUMN     "source_reference" TEXT;

-- AlterTable
ALTER TABLE "traceability"."measurement" ADD COLUMN     "source_reference" TEXT;

-- AlterTable
ALTER TABLE "traceability"."quantity_event" ADD COLUMN     "source_reference" TEXT;

-- AlterTable
ALTER TABLE "traceability"."receiving_event" ADD COLUMN     "source_reference" TEXT;

