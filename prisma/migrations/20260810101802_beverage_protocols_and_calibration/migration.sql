-- CreateEnum
CREATE TYPE "sensory"."SensoryProtocolLicenseStatus" AS ENUM ('adapted_original', 'licensed', 'pending_license');

-- CreateEnum
CREATE TYPE "sensory"."ReferenceStandardOrigin" AS ENUM ('commercial_third_party', 'self_created', 'adapted_from_commercial');

-- CreateEnum
CREATE TYPE "sensory"."StandardValidationMethod" AS ENUM ('none', 'commercial_standard_comparison', 'expert_panel_consensus', 'triangle_test');

-- CreateEnum
CREATE TYPE "sensory"."SensitivityConfidenceLevel" AS ENUM ('not_tested', 'tested_once', 'regularly_calibrated');

-- AlterEnum
ALTER TYPE "sensory"."SensoryProtocolStatus" ADD VALUE 'planned';

-- AlterTable
ALTER TABLE "core"."person" ADD COLUMN     "sensory_certifications" JSONB;

-- AlterTable
ALTER TABLE "sensory"."sensory_attribute" ADD COLUMN     "section" TEXT;

-- AlterTable
ALTER TABLE "sensory"."sensory_protocol" ADD COLUMN     "standard_license_status" "sensory"."SensoryProtocolLicenseStatus",
ADD COLUMN     "standard_source_reference" TEXT;

-- CreateTable
CREATE TABLE "sensory"."reference_standard" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "compound_name" TEXT NOT NULL,
    "sensory_descriptor" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "typical_threshold_value" DECIMAL(10,4),
    "threshold_unit" TEXT,
    "standard_origin" "sensory"."ReferenceStandardOrigin" NOT NULL,
    "supplier_organization_id" UUID,
    "supplier_product_reference" TEXT,
    "data_sheet_reference" TEXT,
    "commerce_product_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_standard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensory"."self_created_standard_detail" (
    "reference_standard_id" UUID NOT NULL,
    "composition_notes" TEXT,
    "creation_method" TEXT,
    "base_material_source" TEXT,
    "validated_against" "sensory"."StandardValidationMethod" NOT NULL DEFAULT 'none',
    "validation_reference" TEXT,
    "created_by_person_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "self_created_standard_detail_pkey" PRIMARY KEY ("reference_standard_id")
);

-- CreateTable
CREATE TABLE "sensory"."calibration_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "conducted_by_person_id" UUID,
    "reference_standards_used" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calibration_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensory"."calibration_result" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "calibration_session_id" UUID NOT NULL,
    "evaluator_person_id" UUID NOT NULL,
    "reference_standard_id" UUID NOT NULL,
    "correctly_identified" BOOLEAN NOT NULL,
    "perceived_descriptor_given" TEXT,
    "perceived_intensity_rating" DECIMAL(6,3),
    "actual_concentration_presented" DECIMAL(10,4),
    "notes" TEXT,

    CONSTRAINT "calibration_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensory"."evaluator_sensitivity_profile" (
    "person_id" UUID NOT NULL,
    "reference_standard_id" UUID NOT NULL,
    "demonstrated_threshold" DECIMAL(10,4),
    "known_anosmic" BOOLEAN,
    "last_calibration_date" TIMESTAMP(3),
    "confidence_level" "sensory"."SensitivityConfidenceLevel" NOT NULL DEFAULT 'not_tested',

    CONSTRAINT "evaluator_sensitivity_profile_pkey" PRIMARY KEY ("person_id","reference_standard_id")
);

-- CreateIndex
CREATE INDEX "reference_standard_category_idx" ON "sensory"."reference_standard"("category");

-- CreateIndex
CREATE INDEX "reference_standard_supplier_organization_id_idx" ON "sensory"."reference_standard"("supplier_organization_id");

-- CreateIndex
CREATE INDEX "calibration_result_calibration_session_id_idx" ON "sensory"."calibration_result"("calibration_session_id");

-- CreateIndex
CREATE INDEX "calibration_result_evaluator_person_id_idx" ON "sensory"."calibration_result"("evaluator_person_id");

-- AddForeignKey
ALTER TABLE "sensory"."reference_standard" ADD CONSTRAINT "reference_standard_supplier_organization_id_fkey" FOREIGN KEY ("supplier_organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."reference_standard" ADD CONSTRAINT "reference_standard_commerce_product_id_fkey" FOREIGN KEY ("commerce_product_id") REFERENCES "core"."product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."self_created_standard_detail" ADD CONSTRAINT "self_created_standard_detail_reference_standard_id_fkey" FOREIGN KEY ("reference_standard_id") REFERENCES "sensory"."reference_standard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."self_created_standard_detail" ADD CONSTRAINT "self_created_standard_detail_created_by_person_id_fkey" FOREIGN KEY ("created_by_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."calibration_session" ADD CONSTRAINT "calibration_session_conducted_by_person_id_fkey" FOREIGN KEY ("conducted_by_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."calibration_result" ADD CONSTRAINT "calibration_result_calibration_session_id_fkey" FOREIGN KEY ("calibration_session_id") REFERENCES "sensory"."calibration_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."calibration_result" ADD CONSTRAINT "calibration_result_evaluator_person_id_fkey" FOREIGN KEY ("evaluator_person_id") REFERENCES "core"."person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."calibration_result" ADD CONSTRAINT "calibration_result_reference_standard_id_fkey" FOREIGN KEY ("reference_standard_id") REFERENCES "sensory"."reference_standard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."evaluator_sensitivity_profile" ADD CONSTRAINT "evaluator_sensitivity_profile_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "core"."person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."evaluator_sensitivity_profile" ADD CONSTRAINT "evaluator_sensitivity_profile_reference_standard_id_fkey" FOREIGN KEY ("reference_standard_id") REFERENCES "sensory"."reference_standard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

