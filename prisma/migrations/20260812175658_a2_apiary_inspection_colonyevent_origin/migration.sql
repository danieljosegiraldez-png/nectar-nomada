/*
  Warnings:

  - Added the required column `origin_type` to the `colony` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "apiary"."ColonyOriginType" AS ENUM ('purchased', 'captured', 'split', 'other');

-- CreateEnum
CREATE TYPE "apiary"."InspectionOutcome" AS ENUM ('nothing_unusual', 'issue_observed');

-- CreateEnum
CREATE TYPE "apiary"."ColonyEventType" AS ENUM ('feeding', 'treatment', 'passing_observation', 'other');

-- AlterTable
ALTER TABLE "apiary"."colony" ADD COLUMN     "origin_note" TEXT,
ADD COLUMN     "origin_type" "apiary"."ColonyOriginType" NOT NULL;

-- CreateTable
CREATE TABLE "apiary"."inspection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "colony_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "operator_person_id" UUID,
    "outcome" "apiary"."InspectionOutcome" NOT NULL,
    "brood_pattern_note" TEXT,
    "queen_sighted" BOOLEAN,
    "stores_level" TEXT,
    "temperament_note" TEXT,
    "pest_disease_flags" TEXT,
    "note" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "data_quality" "core"."DataQuality",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apiary"."colony_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "colony_id" UUID NOT NULL,
    "event_type" "apiary"."ColonyEventType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "operator_person_id" UUID,
    "feeding_material" TEXT,
    "feeding_quantity" DECIMAL(10,3),
    "feeding_unit" TEXT,
    "treatment_product" TEXT,
    "treatment_batch_label" TEXT,
    "treatment_dose" DECIMAL(10,3),
    "treatment_dose_unit" TEXT,
    "note" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "data_quality" "core"."DataQuality",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "colony_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inspection_colony_id_idx" ON "apiary"."inspection"("colony_id");

-- CreateIndex
CREATE INDEX "colony_event_colony_id_idx" ON "apiary"."colony_event"("colony_id");

-- AddForeignKey
ALTER TABLE "apiary"."inspection" ADD CONSTRAINT "inspection_colony_id_fkey" FOREIGN KEY ("colony_id") REFERENCES "apiary"."colony"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."inspection" ADD CONSTRAINT "inspection_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."inspection" ADD CONSTRAINT "inspection_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."colony_event" ADD CONSTRAINT "colony_event_colony_id_fkey" FOREIGN KEY ("colony_id") REFERENCES "apiary"."colony"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."colony_event" ADD CONSTRAINT "colony_event_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."colony_event" ADD CONSTRAINT "colony_event_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
