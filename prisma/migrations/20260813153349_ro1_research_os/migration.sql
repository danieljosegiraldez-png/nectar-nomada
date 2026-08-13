-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "research";

-- CreateEnum
CREATE TYPE "research"."ProtocolVersionStatus" AS ENUM ('draft', 'active', 'superseded');

-- CreateEnum
CREATE TYPE "research"."ProtocolVariableValueType" AS ENUM ('text', 'numeric', 'boolean');

-- CreateEnum
CREATE TYPE "research"."AnalysisRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "research"."PublicationStatus" AS ENUM ('draft', 'submitted', 'published', 'retracted');

-- CreateEnum
CREATE TYPE "research"."ApprovalDecision" AS ENUM ('approved', 'rejected');

-- CreateEnum
CREATE TYPE "research"."ResearchComplianceStatus" AS ENUM ('pending_review', 'approved', 'rejected', 'recategorized');

-- CreateEnum
CREATE TYPE "research"."LanguageFlagStatus" AS ENUM ('clear', 'flagged', 'resolved');

-- AlterTable
ALTER TABLE "core"."asset" ADD COLUMN     "processing_stage_id" UUID,
ADD COLUMN     "treatment_batch_id" UUID;

-- AlterTable
ALTER TABLE "traceability"."measurement" ADD COLUMN     "processing_stage_id" UUID,
ADD COLUMN     "treatment_batch_id" UUID;

-- CreateTable
CREATE TABLE "research"."research_program" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "core"."RecordStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "research_program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."research_question" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_program_id" UUID NOT NULL,
    "question_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "research_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."hypothesis" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_question_id" UUID NOT NULL,
    "statement" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "hypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."experiment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_program_id" UUID NOT NULL,
    "hypothesis_id" UUID,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "core"."RecordStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."protocol" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "experiment_id" UUID,
    "name" TEXT NOT NULL,
    "external_identifier" TEXT,
    "identifier_convention" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "protocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."protocol_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "protocol_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "research"."ProtocolVersionStatus" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "superseded_by_version_id" UUID,

    CONSTRAINT "protocol_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."protocol_variable" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "protocol_version_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "value_type" "research"."ProtocolVariableValueType" NOT NULL,
    "unit" TEXT,
    "is_controlled" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "protocol_variable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."protocol_required_measurement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "protocol_version_id" UUID NOT NULL,
    "variable" TEXT NOT NULL,
    "at_processing_stage" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "protocol_required_measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."treatment_batch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "protocol_version_id" UUID NOT NULL,
    "lot_id" UUID,
    "project_id" UUID,
    "batch_label" TEXT NOT NULL,
    "operator_person_id" UUID,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "notes" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "source_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "treatment_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."treatment_batch_variable_value" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "treatment_batch_id" UUID NOT NULL,
    "protocol_variable_id" UUID NOT NULL,
    "text_value" TEXT,
    "numeric_value" DECIMAL(12,4),
    "boolean_value" BOOLEAN,

    CONSTRAINT "treatment_batch_variable_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."processing_stage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "treatment_batch_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sequence_order" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "processing_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "treatment_batch_id" UUID,
    "sample_id" UUID,
    "asset_id" UUID,
    "measurement_id" UUID,
    "description" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "source_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."evidence_claim" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "evidence_id" UUID NOT NULL,
    "claim_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "evidence_claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."interpretation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "experiment_id" UUID NOT NULL,
    "evidence_claim_id" UUID,
    "interpretation_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "interpretation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."conclusion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "interpretation_id" UUID NOT NULL,
    "conclusion_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "conclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."research_recommendation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conclusion_id" UUID NOT NULL,
    "recommendation_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "research_recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."analysis_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "experiment_id" UUID NOT NULL,
    "plan_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "analysis_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."analysis_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analysis_plan_id" UUID NOT NULL,
    "status" "research"."AnalysisRunStatus" NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "analysis_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."analysis_result" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analysis_run_id" UUID NOT NULL,
    "result_summary" TEXT NOT NULL,
    "result_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "analysis_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."publication" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "experiment_id" UUID,
    "title" TEXT NOT NULL,
    "status" "research"."PublicationStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."deviation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "treatment_batch_id" UUID,
    "processing_stage_id" UUID,
    "description" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "severity" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "deviation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."corrective_action" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "deviation_id" UUID NOT NULL,
    "action_text" TEXT NOT NULL,
    "taken_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "corrective_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."approval" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "approver_user_account_id" UUID NOT NULL,
    "decision" "research"."ApprovalDecision" NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."research_activity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "research_program_id" UUID,
    "is_paid" BOOLEAN NOT NULL,
    "research_question_structured" JSONB,
    "compliance_status" "research"."ResearchComplianceStatus" NOT NULL DEFAULT 'pending_review',
    "public_listing_copy" TEXT,
    "consent_form_copy" TEXT,
    "language_flag_status" "research"."LanguageFlagStatus",
    "proposed_by_user_account_id" UUID,
    "reviewed_by_user_account_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "research_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_question_research_program_id_idx" ON "research"."research_question"("research_program_id");

-- CreateIndex
CREATE INDEX "hypothesis_research_question_id_idx" ON "research"."hypothesis"("research_question_id");

-- CreateIndex
CREATE INDEX "experiment_research_program_id_idx" ON "research"."experiment"("research_program_id");

-- CreateIndex
CREATE INDEX "experiment_hypothesis_id_idx" ON "research"."experiment"("hypothesis_id");

-- CreateIndex
CREATE INDEX "experiment_project_id_idx" ON "research"."experiment"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_external_identifier_key" ON "research"."protocol"("external_identifier");

-- CreateIndex
CREATE INDEX "protocol_experiment_id_idx" ON "research"."protocol"("experiment_id");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_version_protocol_id_version_key" ON "research"."protocol_version"("protocol_id", "version");

-- CreateIndex
CREATE INDEX "protocol_variable_protocol_version_id_idx" ON "research"."protocol_variable"("protocol_version_id");

-- CreateIndex
CREATE INDEX "protocol_required_measurement_protocol_version_id_idx" ON "research"."protocol_required_measurement"("protocol_version_id");

-- CreateIndex
CREATE INDEX "treatment_batch_protocol_version_id_idx" ON "research"."treatment_batch"("protocol_version_id");

-- CreateIndex
CREATE INDEX "treatment_batch_lot_id_idx" ON "research"."treatment_batch"("lot_id");

-- CreateIndex
CREATE INDEX "treatment_batch_project_id_idx" ON "research"."treatment_batch"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_batch_variable_value_treatment_batch_id_protocol__key" ON "research"."treatment_batch_variable_value"("treatment_batch_id", "protocol_variable_id");

-- CreateIndex
CREATE INDEX "processing_stage_treatment_batch_id_idx" ON "research"."processing_stage"("treatment_batch_id");

-- CreateIndex
CREATE INDEX "evidence_treatment_batch_id_idx" ON "research"."evidence"("treatment_batch_id");

-- CreateIndex
CREATE INDEX "evidence_sample_id_idx" ON "research"."evidence"("sample_id");

-- CreateIndex
CREATE INDEX "evidence_asset_id_idx" ON "research"."evidence"("asset_id");

-- CreateIndex
CREATE INDEX "evidence_measurement_id_idx" ON "research"."evidence"("measurement_id");

-- CreateIndex
CREATE INDEX "evidence_claim_evidence_id_idx" ON "research"."evidence_claim"("evidence_id");

-- CreateIndex
CREATE INDEX "interpretation_experiment_id_idx" ON "research"."interpretation"("experiment_id");

-- CreateIndex
CREATE INDEX "interpretation_evidence_claim_id_idx" ON "research"."interpretation"("evidence_claim_id");

-- CreateIndex
CREATE INDEX "conclusion_interpretation_id_idx" ON "research"."conclusion"("interpretation_id");

-- CreateIndex
CREATE INDEX "research_recommendation_conclusion_id_idx" ON "research"."research_recommendation"("conclusion_id");

-- CreateIndex
CREATE INDEX "analysis_plan_experiment_id_idx" ON "research"."analysis_plan"("experiment_id");

-- CreateIndex
CREATE INDEX "analysis_run_analysis_plan_id_idx" ON "research"."analysis_run"("analysis_plan_id");

-- CreateIndex
CREATE INDEX "analysis_result_analysis_run_id_idx" ON "research"."analysis_result"("analysis_run_id");

-- CreateIndex
CREATE INDEX "publication_experiment_id_idx" ON "research"."publication"("experiment_id");

-- CreateIndex
CREATE INDEX "deviation_treatment_batch_id_idx" ON "research"."deviation"("treatment_batch_id");

-- CreateIndex
CREATE INDEX "deviation_processing_stage_id_idx" ON "research"."deviation"("processing_stage_id");

-- CreateIndex
CREATE INDEX "corrective_action_deviation_id_idx" ON "research"."corrective_action"("deviation_id");

-- CreateIndex
CREATE INDEX "approval_entity_type_entity_id_idx" ON "research"."approval"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "research_activity_research_program_id_idx" ON "research"."research_activity"("research_program_id");

-- CreateIndex
CREATE INDEX "research_activity_proposed_by_user_account_id_idx" ON "research"."research_activity"("proposed_by_user_account_id");

-- CreateIndex
CREATE INDEX "asset_treatment_batch_id_idx" ON "core"."asset"("treatment_batch_id");

-- CreateIndex
CREATE INDEX "asset_processing_stage_id_idx" ON "core"."asset"("processing_stage_id");

-- CreateIndex
CREATE INDEX "measurement_treatment_batch_id_idx" ON "traceability"."measurement"("treatment_batch_id");

-- CreateIndex
CREATE INDEX "measurement_processing_stage_id_idx" ON "traceability"."measurement"("processing_stage_id");

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_treatment_batch_id_fkey" FOREIGN KEY ("treatment_batch_id") REFERENCES "research"."treatment_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_processing_stage_id_fkey" FOREIGN KEY ("processing_stage_id") REFERENCES "research"."processing_stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."measurement" ADD CONSTRAINT "measurement_treatment_batch_id_fkey" FOREIGN KEY ("treatment_batch_id") REFERENCES "research"."treatment_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."measurement" ADD CONSTRAINT "measurement_processing_stage_id_fkey" FOREIGN KEY ("processing_stage_id") REFERENCES "research"."processing_stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."research_program" ADD CONSTRAINT "research_program_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."research_question" ADD CONSTRAINT "research_question_research_program_id_fkey" FOREIGN KEY ("research_program_id") REFERENCES "research"."research_program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."research_question" ADD CONSTRAINT "research_question_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."hypothesis" ADD CONSTRAINT "hypothesis_research_question_id_fkey" FOREIGN KEY ("research_question_id") REFERENCES "research"."research_question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."hypothesis" ADD CONSTRAINT "hypothesis_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."experiment" ADD CONSTRAINT "experiment_research_program_id_fkey" FOREIGN KEY ("research_program_id") REFERENCES "research"."research_program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."experiment" ADD CONSTRAINT "experiment_hypothesis_id_fkey" FOREIGN KEY ("hypothesis_id") REFERENCES "research"."hypothesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."experiment" ADD CONSTRAINT "experiment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."experiment" ADD CONSTRAINT "experiment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."protocol" ADD CONSTRAINT "protocol_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "research"."experiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."protocol" ADD CONSTRAINT "protocol_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."protocol_version" ADD CONSTRAINT "protocol_version_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "research"."protocol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."protocol_version" ADD CONSTRAINT "protocol_version_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."protocol_version" ADD CONSTRAINT "protocol_version_superseded_by_version_id_fkey" FOREIGN KEY ("superseded_by_version_id") REFERENCES "research"."protocol_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."protocol_variable" ADD CONSTRAINT "protocol_variable_protocol_version_id_fkey" FOREIGN KEY ("protocol_version_id") REFERENCES "research"."protocol_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."protocol_required_measurement" ADD CONSTRAINT "protocol_required_measurement_protocol_version_id_fkey" FOREIGN KEY ("protocol_version_id") REFERENCES "research"."protocol_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."treatment_batch" ADD CONSTRAINT "treatment_batch_protocol_version_id_fkey" FOREIGN KEY ("protocol_version_id") REFERENCES "research"."protocol_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."treatment_batch" ADD CONSTRAINT "treatment_batch_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."treatment_batch" ADD CONSTRAINT "treatment_batch_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."treatment_batch" ADD CONSTRAINT "treatment_batch_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."treatment_batch" ADD CONSTRAINT "treatment_batch_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."treatment_batch_variable_value" ADD CONSTRAINT "treatment_batch_variable_value_treatment_batch_id_fkey" FOREIGN KEY ("treatment_batch_id") REFERENCES "research"."treatment_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."treatment_batch_variable_value" ADD CONSTRAINT "treatment_batch_variable_value_protocol_variable_id_fkey" FOREIGN KEY ("protocol_variable_id") REFERENCES "research"."protocol_variable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."processing_stage" ADD CONSTRAINT "processing_stage_treatment_batch_id_fkey" FOREIGN KEY ("treatment_batch_id") REFERENCES "research"."treatment_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."processing_stage" ADD CONSTRAINT "processing_stage_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."evidence" ADD CONSTRAINT "evidence_treatment_batch_id_fkey" FOREIGN KEY ("treatment_batch_id") REFERENCES "research"."treatment_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."evidence" ADD CONSTRAINT "evidence_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "core"."sample"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."evidence" ADD CONSTRAINT "evidence_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "core"."asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."evidence" ADD CONSTRAINT "evidence_measurement_id_fkey" FOREIGN KEY ("measurement_id") REFERENCES "traceability"."measurement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."evidence" ADD CONSTRAINT "evidence_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."evidence_claim" ADD CONSTRAINT "evidence_claim_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "research"."evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."evidence_claim" ADD CONSTRAINT "evidence_claim_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."interpretation" ADD CONSTRAINT "interpretation_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "research"."experiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."interpretation" ADD CONSTRAINT "interpretation_evidence_claim_id_fkey" FOREIGN KEY ("evidence_claim_id") REFERENCES "research"."evidence_claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."interpretation" ADD CONSTRAINT "interpretation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."conclusion" ADD CONSTRAINT "conclusion_interpretation_id_fkey" FOREIGN KEY ("interpretation_id") REFERENCES "research"."interpretation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."conclusion" ADD CONSTRAINT "conclusion_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."research_recommendation" ADD CONSTRAINT "research_recommendation_conclusion_id_fkey" FOREIGN KEY ("conclusion_id") REFERENCES "research"."conclusion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."research_recommendation" ADD CONSTRAINT "research_recommendation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."analysis_plan" ADD CONSTRAINT "analysis_plan_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "research"."experiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."analysis_plan" ADD CONSTRAINT "analysis_plan_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."analysis_run" ADD CONSTRAINT "analysis_run_analysis_plan_id_fkey" FOREIGN KEY ("analysis_plan_id") REFERENCES "research"."analysis_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."analysis_run" ADD CONSTRAINT "analysis_run_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."analysis_result" ADD CONSTRAINT "analysis_result_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "research"."analysis_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."analysis_result" ADD CONSTRAINT "analysis_result_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."publication" ADD CONSTRAINT "publication_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "research"."experiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."publication" ADD CONSTRAINT "publication_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."deviation" ADD CONSTRAINT "deviation_treatment_batch_id_fkey" FOREIGN KEY ("treatment_batch_id") REFERENCES "research"."treatment_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."deviation" ADD CONSTRAINT "deviation_processing_stage_id_fkey" FOREIGN KEY ("processing_stage_id") REFERENCES "research"."processing_stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."deviation" ADD CONSTRAINT "deviation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."corrective_action" ADD CONSTRAINT "corrective_action_deviation_id_fkey" FOREIGN KEY ("deviation_id") REFERENCES "research"."deviation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."corrective_action" ADD CONSTRAINT "corrective_action_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."approval" ADD CONSTRAINT "approval_approver_user_account_id_fkey" FOREIGN KEY ("approver_user_account_id") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."research_activity" ADD CONSTRAINT "research_activity_research_program_id_fkey" FOREIGN KEY ("research_program_id") REFERENCES "research"."research_program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."research_activity" ADD CONSTRAINT "research_activity_proposed_by_user_account_id_fkey" FOREIGN KEY ("proposed_by_user_account_id") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."research_activity" ADD CONSTRAINT "research_activity_reviewed_by_user_account_id_fkey" FOREIGN KEY ("reviewed_by_user_account_id") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."research_activity" ADD CONSTRAINT "research_activity_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
