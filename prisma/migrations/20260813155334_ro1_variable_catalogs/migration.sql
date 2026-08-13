-- CreateEnum
CREATE TYPE "core"."DryingRoomLightExposure" AS ENUM ('with_light', 'without_light');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "research"."ProtocolVariableValueType" ADD VALUE 'catalog';
ALTER TYPE "research"."ProtocolVariableValueType" ADD VALUE 'closed_enum';

-- AlterTable
ALTER TABLE "core"."location" ADD COLUMN     "drying_room_bed_level_count" INTEGER,
ADD COLUMN     "drying_room_light_exposure" "core"."DryingRoomLightExposure";

-- AlterTable
ALTER TABLE "research"."processing_stage" ADD COLUMN     "location_id" UUID;

-- AlterTable
ALTER TABLE "research"."protocol_required_measurement" ADD COLUMN     "catalog_id" UUID,
ALTER COLUMN "variable" DROP NOT NULL;

-- AlterTable
ALTER TABLE "research"."protocol_variable" ADD COLUMN     "catalog_id" UUID,
ADD COLUMN     "enum_values" TEXT[];

-- AlterTable
ALTER TABLE "research"."treatment_batch_variable_value" ADD COLUMN     "catalog_value_id" UUID,
ADD COLUMN     "data_quality" "core"."DataQuality";

-- CreateTable
CREATE TABLE "research"."variable_catalog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variable_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."variable_catalog_value" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "catalog_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "implies_unknown_identity" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "variable_catalog_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."processing_stage_observation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "processing_stage_id" UUID NOT NULL,
    "catalog_value_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "source_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "processing_stage_observation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "variable_catalog_key_key" ON "research"."variable_catalog"("key");

-- CreateIndex
CREATE UNIQUE INDEX "variable_catalog_value_catalog_id_value_key" ON "research"."variable_catalog_value"("catalog_id", "value");

-- CreateIndex
CREATE INDEX "processing_stage_observation_processing_stage_id_idx" ON "research"."processing_stage_observation"("processing_stage_id");

-- CreateIndex
CREATE INDEX "processing_stage_observation_catalog_value_id_idx" ON "research"."processing_stage_observation"("catalog_value_id");

-- CreateIndex
CREATE INDEX "processing_stage_location_id_idx" ON "research"."processing_stage"("location_id");

-- CreateIndex
CREATE INDEX "protocol_required_measurement_catalog_id_idx" ON "research"."protocol_required_measurement"("catalog_id");

-- CreateIndex
CREATE INDEX "protocol_variable_catalog_id_idx" ON "research"."protocol_variable"("catalog_id");

-- CreateIndex
CREATE INDEX "treatment_batch_variable_value_catalog_value_id_idx" ON "research"."treatment_batch_variable_value"("catalog_value_id");

-- AddForeignKey
ALTER TABLE "research"."variable_catalog_value" ADD CONSTRAINT "variable_catalog_value_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "research"."variable_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."protocol_variable" ADD CONSTRAINT "protocol_variable_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "research"."variable_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."protocol_required_measurement" ADD CONSTRAINT "protocol_required_measurement_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "research"."variable_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."treatment_batch_variable_value" ADD CONSTRAINT "treatment_batch_variable_value_catalog_value_id_fkey" FOREIGN KEY ("catalog_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."processing_stage" ADD CONSTRAINT "processing_stage_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."processing_stage_observation" ADD CONSTRAINT "processing_stage_observation_processing_stage_id_fkey" FOREIGN KEY ("processing_stage_id") REFERENCES "research"."processing_stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."processing_stage_observation" ADD CONSTRAINT "processing_stage_observation_catalog_value_id_fkey" FOREIGN KEY ("catalog_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."processing_stage_observation" ADD CONSTRAINT "processing_stage_observation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
