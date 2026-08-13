-- AlterTable
ALTER TABLE "core"."asset" ADD COLUMN     "colony_event_id" UUID,
ADD COLUMN     "colony_id" UUID,
ADD COLUMN     "hive_id" UUID,
ADD COLUMN     "inspection_id" UUID;

-- CreateIndex
CREATE INDEX "asset_hive_id_idx" ON "core"."asset"("hive_id");

-- CreateIndex
CREATE INDEX "asset_colony_id_idx" ON "core"."asset"("colony_id");

-- CreateIndex
CREATE INDEX "asset_inspection_id_idx" ON "core"."asset"("inspection_id");

-- CreateIndex
CREATE INDEX "asset_colony_event_id_idx" ON "core"."asset"("colony_event_id");

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "apiary"."hive"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_colony_id_fkey" FOREIGN KEY ("colony_id") REFERENCES "apiary"."colony"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "apiary"."inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_colony_event_id_fkey" FOREIGN KEY ("colony_event_id") REFERENCES "apiary"."colony_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
