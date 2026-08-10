-- CreateEnum
CREATE TYPE "traceability"."MeasurementSourceType" AS ENUM ('manual', 'device', 'sensor', 'lab', 'import', 'external_context', 'derived');

-- CreateTable
CREATE TABLE "traceability"."measurement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variable" TEXT NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "lot_id" UUID,
    "sample_id" UUID,
    "fermentation_run_id" UUID,
    "drying_run_id" UUID,
    "storage_assignment_id" UUID,
    "source_type" "traceability"."MeasurementSourceType" NOT NULL DEFAULT 'manual',
    "device_id" TEXT,
    "operator_person_id" UUID,
    "corrects_id" UUID,
    "reason" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL DEFAULT 'direct_observation',
    "data_quality" "core"."DataQuality",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "measurement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "measurement_lot_id_idx" ON "traceability"."measurement"("lot_id");

-- CreateIndex
CREATE INDEX "measurement_sample_id_idx" ON "traceability"."measurement"("sample_id");

-- CreateIndex
CREATE INDEX "measurement_fermentation_run_id_idx" ON "traceability"."measurement"("fermentation_run_id");

-- CreateIndex
CREATE INDEX "measurement_drying_run_id_idx" ON "traceability"."measurement"("drying_run_id");

-- CreateIndex
CREATE INDEX "measurement_storage_assignment_id_idx" ON "traceability"."measurement"("storage_assignment_id");

-- CreateIndex
CREATE INDEX "measurement_corrects_id_idx" ON "traceability"."measurement"("corrects_id");

-- AddForeignKey
ALTER TABLE "traceability"."measurement" ADD CONSTRAINT "measurement_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."measurement" ADD CONSTRAINT "measurement_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "core"."sample"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."measurement" ADD CONSTRAINT "measurement_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."measurement" ADD CONSTRAINT "measurement_corrects_id_fkey" FOREIGN KEY ("corrects_id") REFERENCES "traceability"."measurement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."measurement" ADD CONSTRAINT "measurement_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

