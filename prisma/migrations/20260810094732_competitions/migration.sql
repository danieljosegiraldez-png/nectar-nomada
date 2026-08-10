-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "competitions";

-- CreateEnum
CREATE TYPE "competitions"."CompetitionStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "competitions"."CompetitionEditionStatus" AS ENUM ('planning', 'open_for_entries', 'judging', 'completed');

-- CreateEnum
CREATE TYPE "competitions"."EntryStatus" AS ENUM ('registered', 'received', 'disqualified', 'judged');

-- CreateEnum
CREATE TYPE "competitions"."CompetitionResultStatus" AS ENUM ('draft', 'finalized');

-- CreateTable
CREATE TABLE "competitions"."competition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "competitions"."CompetitionStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions"."competition_edition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "competition_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "status" "competitions"."CompetitionEditionStatus" NOT NULL DEFAULT 'planning',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_edition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions"."competition_category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "edition_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sensory_protocol_version_id" UUID NOT NULL,
    "sensory_session_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions"."entry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "sample_id" UUID NOT NULL,
    "competitor_person_id" UUID,
    "competitor_organization_id" UUID,
    "status" "competitions"."EntryStatus" NOT NULL DEFAULT 'registered',
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions"."competition_judge_assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "conflict_of_interest_declared" BOOLEAN NOT NULL DEFAULT false,
    "conflict_of_interest_notes" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_judge_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions"."competition_result" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "blind_sample_id" UUID NOT NULL,
    "final_score" DECIMAL(6,3),
    "rank" INTEGER,
    "status" "competitions"."CompetitionResultStatus" NOT NULL DEFAULT 'draft',
    "finalized_by_user_account_id" UUID,
    "finalized_at" TIMESTAMP(3),

    CONSTRAINT "competition_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions"."award" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "result_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "award_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "competition_edition_competition_id_idx" ON "competitions"."competition_edition"("competition_id");

-- CreateIndex
CREATE INDEX "competition_category_edition_id_idx" ON "competitions"."competition_category"("edition_id");

-- CreateIndex
CREATE INDEX "competition_category_sensory_protocol_version_id_idx" ON "competitions"."competition_category"("sensory_protocol_version_id");

-- CreateIndex
CREATE INDEX "entry_category_id_idx" ON "competitions"."entry"("category_id");

-- CreateIndex
CREATE INDEX "entry_sample_id_idx" ON "competitions"."entry"("sample_id");

-- CreateIndex
CREATE UNIQUE INDEX "competition_judge_assignment_category_id_user_account_id_key" ON "competitions"."competition_judge_assignment"("category_id", "user_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "competition_result_entry_id_key" ON "competitions"."competition_result"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "competition_result_blind_sample_id_key" ON "competitions"."competition_result"("blind_sample_id");

-- CreateIndex
CREATE UNIQUE INDEX "award_result_id_key" ON "competitions"."award"("result_id");

-- AddForeignKey
ALTER TABLE "competitions"."competition_edition" ADD CONSTRAINT "competition_edition_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"."competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions"."competition_category" ADD CONSTRAINT "competition_category_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "competitions"."competition_edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions"."competition_category" ADD CONSTRAINT "competition_category_sensory_protocol_version_id_fkey" FOREIGN KEY ("sensory_protocol_version_id") REFERENCES "sensory"."sensory_protocol_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions"."competition_category" ADD CONSTRAINT "competition_category_sensory_session_id_fkey" FOREIGN KEY ("sensory_session_id") REFERENCES "sensory"."sensory_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions"."entry" ADD CONSTRAINT "entry_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "competitions"."competition_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions"."entry" ADD CONSTRAINT "entry_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "core"."sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions"."entry" ADD CONSTRAINT "entry_competitor_person_id_fkey" FOREIGN KEY ("competitor_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions"."entry" ADD CONSTRAINT "entry_competitor_organization_id_fkey" FOREIGN KEY ("competitor_organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions"."competition_judge_assignment" ADD CONSTRAINT "competition_judge_assignment_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "competitions"."competition_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions"."competition_judge_assignment" ADD CONSTRAINT "competition_judge_assignment_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions"."competition_result" ADD CONSTRAINT "competition_result_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "competitions"."entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions"."competition_result" ADD CONSTRAINT "competition_result_blind_sample_id_fkey" FOREIGN KEY ("blind_sample_id") REFERENCES "sensory"."sensory_blind_sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions"."competition_result" ADD CONSTRAINT "competition_result_finalized_by_user_account_id_fkey" FOREIGN KEY ("finalized_by_user_account_id") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions"."award" ADD CONSTRAINT "award_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "competitions"."competition_result"("id") ON DELETE CASCADE ON UPDATE CASCADE;

