/*
  Warnings:

  - You are about to drop the column `altitude_meters` on the `location` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "core"."SunExposure" AS ENUM ('full_sun', 'morning', 'afternoon', 'both');

-- CreateEnum
CREATE TYPE "core"."ShadePercentageBracket" AS ENUM ('pct_20', 'pct_30', 'pct_50', 'pct_70', 'pct_90');

-- CreateEnum
CREATE TYPE "core"."SubdivisionReason" AS ENUM ('altitude', 'shade', 'slope', 'other');

-- CreateEnum
CREATE TYPE "traceability"."PlantingEventType" AS ENUM ('received', 'planted');

-- CreateEnum
CREATE TYPE "traceability"."SpecimenType" AS ENUM ('plant', 'trap');

-- CreateEnum
CREATE TYPE "traceability"."SpecimenStatus" AS ENUM ('active', 'removed', 'dead');

-- CreateEnum
CREATE TYPE "traceability"."SpecimenSector" AS ENUM ('alto', 'medio', 'bajo');

-- CreateEnum
CREATE TYPE "traceability"."SpecimenObservationType" AS ENUM ('bloom_start', 'bloom_peak', 'bloom_end', 'health', 'material_harvested', 'installed', 'removed', 'reinstalled', 'trap_check', 'other');

-- AlterTable
ALTER TABLE "core"."asset" ADD COLUMN     "specimen_id" UUID;

-- AlterTable
ALTER TABLE "core"."location" DROP COLUMN "altitude_meters",
ADD COLUMN     "altitude_max_m" INTEGER,
ADD COLUMN     "altitude_min_m" INTEGER,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "plant_spacing_meters" DECIMAL(5,2),
ADD COLUMN     "shade_percentage" "core"."ShadePercentageBracket",
ADD COLUMN     "slope_description" TEXT,
ADD COLUMN     "soil_type" TEXT,
ADD COLUMN     "subdivision_reason" "core"."SubdivisionReason",
ADD COLUMN     "subdivision_reason_note" TEXT,
ADD COLUMN     "sun_exposure" "core"."SunExposure";

-- AlterTable
ALTER TABLE "traceability"."labour_entry" ADD COLUMN     "location_id" UUID;

-- AlterTable
ALTER TABLE "traceability"."material_consumption_entry" ADD COLUMN     "location_id" UUID;

-- CreateTable
CREATE TABLE "traceability"."planting_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "event_type" "traceability"."PlantingEventType" NOT NULL,
    "varietal" TEXT,
    "quantity" INTEGER,
    "unit" TEXT DEFAULT 'plantones',
    "source_organization_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operator_person_id" UUID,
    "notes" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "source_reference" TEXT,
    "data_quality" "core"."DataQuality",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "planting_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."specimen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "specimen_type" "traceability"."SpecimenType" NOT NULL,
    "common_name" TEXT NOT NULL,
    "varietal_note" TEXT,
    "planted_date" TIMESTAMP(3),
    "status" "traceability"."SpecimenStatus" NOT NULL DEFAULT 'active',
    "sector_simple" "traceability"."SpecimenSector",
    "grid_row" INTEGER,
    "grid_position" INTEGER,
    "density_note" TEXT,
    "notes" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "data_quality" "core"."DataQuality",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "specimen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."specimen_observation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "specimen_id" UUID NOT NULL,
    "observation_type" "traceability"."SpecimenObservationType" NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "observer_person_id" UUID,
    "capture_count" INTEGER,
    "notes" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "data_quality" "core"."DataQuality",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "specimen_observation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planting_event_location_id_idx" ON "traceability"."planting_event"("location_id");

-- CreateIndex
CREATE INDEX "planting_event_source_organization_id_idx" ON "traceability"."planting_event"("source_organization_id");

-- CreateIndex
CREATE INDEX "specimen_location_id_idx" ON "traceability"."specimen"("location_id");

-- CreateIndex
CREATE INDEX "specimen_observation_specimen_id_idx" ON "traceability"."specimen_observation"("specimen_id");

-- CreateIndex
CREATE INDEX "asset_specimen_id_idx" ON "core"."asset"("specimen_id");

-- CreateIndex
CREATE INDEX "labour_entry_location_id_idx" ON "traceability"."labour_entry"("location_id");

-- CreateIndex
CREATE INDEX "material_consumption_entry_location_id_idx" ON "traceability"."material_consumption_entry"("location_id");

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "traceability"."specimen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."labour_entry" ADD CONSTRAINT "labour_entry_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."material_consumption_entry" ADD CONSTRAINT "material_consumption_entry_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."planting_event" ADD CONSTRAINT "planting_event_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."planting_event" ADD CONSTRAINT "planting_event_source_organization_id_fkey" FOREIGN KEY ("source_organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."planting_event" ADD CONSTRAINT "planting_event_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."planting_event" ADD CONSTRAINT "planting_event_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."specimen" ADD CONSTRAINT "specimen_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."specimen" ADD CONSTRAINT "specimen_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."specimen_observation" ADD CONSTRAINT "specimen_observation_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "traceability"."specimen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."specimen_observation" ADD CONSTRAINT "specimen_observation_observer_person_id_fkey" FOREIGN KEY ("observer_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."specimen_observation" ADD CONSTRAINT "specimen_observation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
