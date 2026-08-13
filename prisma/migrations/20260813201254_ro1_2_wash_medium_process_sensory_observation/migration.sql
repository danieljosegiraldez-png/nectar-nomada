-- CreateEnum
CREATE TYPE "research"."ProcessSensoryMedium" AS ENUM ('mosto', 'cereza', 'pergamino', 'grano');

-- AlterTable
ALTER TABLE "research"."evidence" ADD COLUMN     "process_sensory_observation_id" UUID;

-- AlterTable
ALTER TABLE "research"."processing_stage" ADD COLUMN     "wash_medium_catalog_value_id" UUID,
ADD COLUMN     "wash_medium_source_lot_id" UUID;

-- CreateTable
CREATE TABLE "research"."process_sensory_observation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "processing_stage_id" UUID NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "observer_person_id" UUID,
    "medium" "research"."ProcessSensoryMedium" NOT NULL,
    "free_text_descriptor" TEXT NOT NULL,
    "structured_descriptor_id" UUID,
    "intensity" TEXT,
    "triggered_intervention" BOOLEAN NOT NULL DEFAULT false,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "source_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "process_sensory_observation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "process_sensory_observation_processing_stage_id_idx" ON "research"."process_sensory_observation"("processing_stage_id");

-- CreateIndex
CREATE INDEX "process_sensory_observation_structured_descriptor_id_idx" ON "research"."process_sensory_observation"("structured_descriptor_id");

-- CreateIndex
CREATE INDEX "process_sensory_observation_observer_person_id_idx" ON "research"."process_sensory_observation"("observer_person_id");

-- CreateIndex
CREATE INDEX "evidence_process_sensory_observation_id_idx" ON "research"."evidence"("process_sensory_observation_id");

-- CreateIndex
CREATE INDEX "processing_stage_wash_medium_catalog_value_id_idx" ON "research"."processing_stage"("wash_medium_catalog_value_id");

-- CreateIndex
CREATE INDEX "processing_stage_wash_medium_source_lot_id_idx" ON "research"."processing_stage"("wash_medium_source_lot_id");

-- AddForeignKey
ALTER TABLE "research"."processing_stage" ADD CONSTRAINT "processing_stage_wash_medium_catalog_value_id_fkey" FOREIGN KEY ("wash_medium_catalog_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."processing_stage" ADD CONSTRAINT "processing_stage_wash_medium_source_lot_id_fkey" FOREIGN KEY ("wash_medium_source_lot_id") REFERENCES "traceability"."lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."process_sensory_observation" ADD CONSTRAINT "process_sensory_observation_processing_stage_id_fkey" FOREIGN KEY ("processing_stage_id") REFERENCES "research"."processing_stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."process_sensory_observation" ADD CONSTRAINT "process_sensory_observation_observer_person_id_fkey" FOREIGN KEY ("observer_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."process_sensory_observation" ADD CONSTRAINT "process_sensory_observation_structured_descriptor_id_fkey" FOREIGN KEY ("structured_descriptor_id") REFERENCES "sensory"."sensory_descriptor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."process_sensory_observation" ADD CONSTRAINT "process_sensory_observation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."evidence" ADD CONSTRAINT "evidence_process_sensory_observation_id_fkey" FOREIGN KEY ("process_sensory_observation_id") REFERENCES "research"."process_sensory_observation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

