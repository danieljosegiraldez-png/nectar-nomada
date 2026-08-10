-- AlterTable
ALTER TABLE "traceability"."lot" ADD COLUMN     "location_id" UUID;

-- AddForeignKey
ALTER TABLE "traceability"."lot" ADD CONSTRAINT "lot_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

