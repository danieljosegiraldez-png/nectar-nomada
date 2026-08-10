-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "traceability";

-- CreateEnum
CREATE TYPE "core"."ProvenanceClass" AS ENUM ('measured_fact', 'original_record', 'direct_observation', 'scientific_evidence', 'manufacturer_specification', 'interpretation', 'hypothesis', 'conclusion', 'recommendation', 'ai_suggestion');

-- CreateEnum
CREATE TYPE "core"."DataQuality" AS ENUM ('verified', 'verified_with_limitation', 'provisional', 'unconfirmed', 'conflicting', 'superseded', 'working_hypothesis', 'not_tested', 'missing_source_record');

-- CreateEnum
CREATE TYPE "traceability"."LotType" AS ENUM ('cherry', 'processing', 'drying', 'green', 'roast', 'sample', 'other');

-- CreateEnum
CREATE TYPE "traceability"."LotTransformationType" AS ENUM ('split', 'merge', 'blend', 'stage_change', 'sample_extraction', 'loss', 'disposal', 'sale');

-- CreateTable
CREATE TABLE "traceability"."lot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lot_code" TEXT NOT NULL,
    "lot_type" "traceability"."LotType" NOT NULL,
    "organization_id" UUID,
    "project_id" UUID,
    "status" "core"."RecordStatus" NOT NULL DEFAULT 'draft',
    "classification" "core"."ClassificationLevel" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."lot_transformation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transformation_type" "traceability"."LotTransformationType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "operator_person_id" UUID,
    "notes" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL DEFAULT 'direct_observation',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "lot_transformation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."lot_transformation_input" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transformation_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "quantity" DECIMAL(10,3),
    "unit" TEXT,

    CONSTRAINT "lot_transformation_input_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."lot_transformation_output" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transformation_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "quantity" DECIMAL(10,3),
    "unit" TEXT,

    CONSTRAINT "lot_transformation_output_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lot_lot_code_key" ON "traceability"."lot"("lot_code");

-- CreateIndex
CREATE INDEX "lot_organization_id_idx" ON "traceability"."lot"("organization_id");

-- CreateIndex
CREATE INDEX "lot_project_id_idx" ON "traceability"."lot"("project_id");

-- CreateIndex
CREATE INDEX "lot_transformation_occurred_at_idx" ON "traceability"."lot_transformation"("occurred_at");

-- CreateIndex
CREATE INDEX "lot_transformation_input_transformation_id_idx" ON "traceability"."lot_transformation_input"("transformation_id");

-- CreateIndex
CREATE INDEX "lot_transformation_input_lot_id_idx" ON "traceability"."lot_transformation_input"("lot_id");

-- CreateIndex
CREATE INDEX "lot_transformation_output_transformation_id_idx" ON "traceability"."lot_transformation_output"("transformation_id");

-- CreateIndex
CREATE INDEX "lot_transformation_output_lot_id_idx" ON "traceability"."lot_transformation_output"("lot_id");

-- AddForeignKey
ALTER TABLE "traceability"."lot" ADD CONSTRAINT "lot_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lot" ADD CONSTRAINT "lot_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lot" ADD CONSTRAINT "lot_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lot_transformation" ADD CONSTRAINT "lot_transformation_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lot_transformation" ADD CONSTRAINT "lot_transformation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lot_transformation_input" ADD CONSTRAINT "lot_transformation_input_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "traceability"."lot_transformation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lot_transformation_input" ADD CONSTRAINT "lot_transformation_input_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lot_transformation_output" ADD CONSTRAINT "lot_transformation_output_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "traceability"."lot_transformation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lot_transformation_output" ADD CONSTRAINT "lot_transformation_output_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

