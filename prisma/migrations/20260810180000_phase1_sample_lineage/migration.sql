-- AlterTable
ALTER TABLE "core"."sample" ADD COLUMN     "source_lot_id" UUID,
ADD COLUMN     "source_transformation_id" UUID;

-- CreateIndex
CREATE INDEX "sample_source_lot_id_idx" ON "core"."sample"("source_lot_id");

-- CreateIndex
CREATE INDEX "sample_source_transformation_id_idx" ON "core"."sample"("source_transformation_id");

-- AddForeignKey
ALTER TABLE "core"."sample" ADD CONSTRAINT "sample_source_lot_id_fkey" FOREIGN KEY ("source_lot_id") REFERENCES "traceability"."lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."sample" ADD CONSTRAINT "sample_source_transformation_id_fkey" FOREIGN KEY ("source_transformation_id") REFERENCES "traceability"."lot_transformation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

