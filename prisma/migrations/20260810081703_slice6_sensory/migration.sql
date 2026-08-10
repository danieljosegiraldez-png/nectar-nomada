-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "sensory";

-- CreateEnum
CREATE TYPE "sensory"."SensoryProtocolStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "sensory"."SensoryProtocolVersionStatus" AS ENUM ('draft', 'active', 'superseded');

-- CreateEnum
CREATE TYPE "sensory"."SensorySessionStatus" AS ENUM ('draft', 'blind_coding', 'in_progress', 'completed', 'locked');

-- CreateEnum
CREATE TYPE "sensory"."AssessmentStatus" AS ENUM ('submitted', 'superseded');

-- CreateTable
CREATE TABLE "sensory"."sensory_protocol" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "sensory"."SensoryProtocolStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sensory_protocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensory"."sensory_protocol_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "protocol_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "score_min" DECIMAL(5,2) NOT NULL,
    "score_max" DECIMAL(5,2) NOT NULL,
    "status" "sensory"."SensoryProtocolVersionStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_by_version_id" UUID,

    CONSTRAINT "sensory_protocol_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensory"."sensory_attribute" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "protocol_version_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "scale_min" DECIMAL(5,2) NOT NULL,
    "scale_max" DECIMAL(5,2) NOT NULL,
    "description" TEXT,

    CONSTRAINT "sensory_attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensory"."sensory_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "protocol_version_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "status" "sensory"."SensorySessionStatus" NOT NULL DEFAULT 'draft',
    "classification" "core"."ClassificationLevel" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "sensory_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensory"."sensory_flight" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sequence_order" INTEGER NOT NULL,

    CONSTRAINT "sensory_flight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensory"."sensory_blind_sample" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flight_id" UUID NOT NULL,
    "blind_code" TEXT NOT NULL,

    CONSTRAINT "sensory_blind_sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensory"."sensory_blind_mapping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "blind_sample_id" UUID NOT NULL,
    "sample_id" UUID NOT NULL,
    "revealed_at" TIMESTAMP(3),

    CONSTRAINT "sensory_blind_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensory"."assessment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "blind_sample_id" UUID NOT NULL,
    "evaluator_user_account_id" UUID NOT NULL,
    "overall_score" DECIMAL(5,2),
    "comment" TEXT,
    "status" "sensory"."AssessmentStatus" NOT NULL DEFAULT 'submitted',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedes_assessment_id" UUID,

    CONSTRAINT "assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensory"."attribute_response" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assessment_id" UUID NOT NULL,
    "attribute_id" UUID NOT NULL,
    "value" DECIMAL(5,2) NOT NULL,
    "comment" TEXT,

    CONSTRAINT "attribute_response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensory"."panel_result" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "blind_sample_id" UUID NOT NULL,
    "attribute_id" UUID,
    "method" TEXT NOT NULL DEFAULT 'simple_mean_v1',
    "response_count" INTEGER NOT NULL,
    "mean_value" DECIMAL(6,3) NOT NULL,
    "min_value" DECIMAL(6,3) NOT NULL,
    "max_value" DECIMAL(6,3) NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "panel_result_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sensory_protocol_version_protocol_id_version_key" ON "sensory"."sensory_protocol_version"("protocol_id", "version");

-- CreateIndex
CREATE INDEX "sensory_attribute_protocol_version_id_idx" ON "sensory"."sensory_attribute"("protocol_version_id");

-- CreateIndex
CREATE INDEX "sensory_session_protocol_version_id_idx" ON "sensory"."sensory_session"("protocol_version_id");

-- CreateIndex
CREATE INDEX "sensory_flight_session_id_idx" ON "sensory"."sensory_flight"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "sensory_blind_sample_flight_id_blind_code_key" ON "sensory"."sensory_blind_sample"("flight_id", "blind_code");

-- CreateIndex
CREATE UNIQUE INDEX "sensory_blind_mapping_blind_sample_id_key" ON "sensory"."sensory_blind_mapping"("blind_sample_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_supersedes_assessment_id_key" ON "sensory"."assessment"("supersedes_assessment_id");

-- CreateIndex
CREATE INDEX "assessment_blind_sample_id_idx" ON "sensory"."assessment"("blind_sample_id");

-- CreateIndex
CREATE INDEX "assessment_evaluator_user_account_id_idx" ON "sensory"."assessment"("evaluator_user_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_response_assessment_id_attribute_id_key" ON "sensory"."attribute_response"("assessment_id", "attribute_id");

-- CreateIndex
CREATE UNIQUE INDEX "panel_result_blind_sample_id_attribute_id_key" ON "sensory"."panel_result"("blind_sample_id", "attribute_id");

-- AddForeignKey
ALTER TABLE "sensory"."sensory_protocol_version" ADD CONSTRAINT "sensory_protocol_version_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "sensory"."sensory_protocol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."sensory_protocol_version" ADD CONSTRAINT "sensory_protocol_version_superseded_by_version_id_fkey" FOREIGN KEY ("superseded_by_version_id") REFERENCES "sensory"."sensory_protocol_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."sensory_attribute" ADD CONSTRAINT "sensory_attribute_protocol_version_id_fkey" FOREIGN KEY ("protocol_version_id") REFERENCES "sensory"."sensory_protocol_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."sensory_session" ADD CONSTRAINT "sensory_session_protocol_version_id_fkey" FOREIGN KEY ("protocol_version_id") REFERENCES "sensory"."sensory_protocol_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."sensory_session" ADD CONSTRAINT "sensory_session_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."sensory_flight" ADD CONSTRAINT "sensory_flight_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sensory"."sensory_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."sensory_blind_sample" ADD CONSTRAINT "sensory_blind_sample_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "sensory"."sensory_flight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."sensory_blind_mapping" ADD CONSTRAINT "sensory_blind_mapping_blind_sample_id_fkey" FOREIGN KEY ("blind_sample_id") REFERENCES "sensory"."sensory_blind_sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."sensory_blind_mapping" ADD CONSTRAINT "sensory_blind_mapping_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "core"."sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."assessment" ADD CONSTRAINT "assessment_blind_sample_id_fkey" FOREIGN KEY ("blind_sample_id") REFERENCES "sensory"."sensory_blind_sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."assessment" ADD CONSTRAINT "assessment_evaluator_user_account_id_fkey" FOREIGN KEY ("evaluator_user_account_id") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."assessment" ADD CONSTRAINT "assessment_supersedes_assessment_id_fkey" FOREIGN KEY ("supersedes_assessment_id") REFERENCES "sensory"."assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."attribute_response" ADD CONSTRAINT "attribute_response_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "sensory"."assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."attribute_response" ADD CONSTRAINT "attribute_response_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "sensory"."sensory_attribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."panel_result" ADD CONSTRAINT "panel_result_blind_sample_id_fkey" FOREIGN KEY ("blind_sample_id") REFERENCES "sensory"."sensory_blind_sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."panel_result" ADD CONSTRAINT "panel_result_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "sensory"."sensory_attribute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

