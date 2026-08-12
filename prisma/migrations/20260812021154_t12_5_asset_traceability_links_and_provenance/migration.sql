/*
  Warnings:

  - Added the required column `provenance_class` to the `asset` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "core"."asset" ADD COLUMN     "data_quality" "core"."DataQuality",
ADD COLUMN     "drying_run_id" UUID,
ADD COLUMN     "fermentation_run_id" UUID,
ADD COLUMN     "harvest_event_id" UUID,
ADD COLUMN     "lot_id" UUID,
ADD COLUMN     "measurement_id" UUID,
ADD COLUMN     "provenance_class" "core"."ProvenanceClass" NOT NULL,
ADD COLUMN     "sample_id" UUID,
ADD COLUMN     "source_reference" TEXT;

-- CreateIndex
CREATE INDEX "asset_lot_id_idx" ON "core"."asset"("lot_id");

-- CreateIndex
CREATE INDEX "asset_harvest_event_id_idx" ON "core"."asset"("harvest_event_id");

-- CreateIndex
CREATE INDEX "asset_measurement_id_idx" ON "core"."asset"("measurement_id");

-- CreateIndex
CREATE INDEX "asset_fermentation_run_id_idx" ON "core"."asset"("fermentation_run_id");

-- CreateIndex
CREATE INDEX "asset_drying_run_id_idx" ON "core"."asset"("drying_run_id");

-- CreateIndex
CREATE INDEX "asset_sample_id_idx" ON "core"."asset"("sample_id");

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_harvest_event_id_fkey" FOREIGN KEY ("harvest_event_id") REFERENCES "traceability"."harvest_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_measurement_id_fkey" FOREIGN KEY ("measurement_id") REFERENCES "traceability"."measurement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_fermentation_run_id_fkey" FOREIGN KEY ("fermentation_run_id") REFERENCES "traceability"."fermentation_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_drying_run_id_fkey" FOREIGN KEY ("drying_run_id") REFERENCES "traceability"."drying_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "core"."sample"("id") ON DELETE SET NULL ON UPDATE CASCADE;
