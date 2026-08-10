-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "partner";

-- CreateEnum
CREATE TYPE "core"."AssetStatus" AS ENUM ('draft', 'approved', 'archived');

-- CreateEnum
CREATE TYPE "partner"."TaskStatus" AS ENUM ('open', 'in_progress', 'submitted', 'completed', 'blocked');

-- CreateTable
CREATE TABLE "core"."asset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "storage_bucket" TEXT NOT NULL,
    "checksum_sha256" TEXT,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_filename" TEXT,
    "creator_person_id" UUID,
    "captured_at" TIMESTAMP(3),
    "location_id" UUID,
    "project_id" UUID,
    "usage_rights" TEXT,
    "status" "core"."AssetStatus" NOT NULL DEFAULT 'draft',
    "classification" "core"."ClassificationLevel" NOT NULL DEFAULT 'internal',
    "derivative_of_asset_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."task" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigned_to_user_account_id" UUID,
    "due_date" TIMESTAMP(3),
    "status" "partner"."TaskStatus" NOT NULL DEFAULT 'open',
    "classification" "core"."ClassificationLevel" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."field_submission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "task_id" UUID,
    "submitted_by_user_account_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "classification" "core"."ClassificationLevel" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."field_submission_asset" (
    "field_submission_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,

    CONSTRAINT "field_submission_asset_pkey" PRIMARY KEY ("field_submission_id","asset_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_storage_key_key" ON "core"."asset"("storage_key");

-- CreateIndex
CREATE INDEX "asset_project_id_idx" ON "core"."asset"("project_id");

-- CreateIndex
CREATE INDEX "asset_location_id_idx" ON "core"."asset"("location_id");

-- CreateIndex
CREATE INDEX "task_project_id_idx" ON "partner"."task"("project_id");

-- CreateIndex
CREATE INDEX "task_assigned_to_user_account_id_idx" ON "partner"."task"("assigned_to_user_account_id");

-- CreateIndex
CREATE INDEX "field_submission_project_id_idx" ON "partner"."field_submission"("project_id");

-- CreateIndex
CREATE INDEX "field_submission_task_id_idx" ON "partner"."field_submission"("task_id");

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_creator_person_id_fkey" FOREIGN KEY ("creator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_derivative_of_asset_id_fkey" FOREIGN KEY ("derivative_of_asset_id") REFERENCES "core"."asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."task" ADD CONSTRAINT "task_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."task" ADD CONSTRAINT "task_assigned_to_user_account_id_fkey" FOREIGN KEY ("assigned_to_user_account_id") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."task" ADD CONSTRAINT "task_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."field_submission" ADD CONSTRAINT "field_submission_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."field_submission" ADD CONSTRAINT "field_submission_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "partner"."task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."field_submission" ADD CONSTRAINT "field_submission_submitted_by_user_account_id_fkey" FOREIGN KEY ("submitted_by_user_account_id") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."field_submission_asset" ADD CONSTRAINT "field_submission_asset_field_submission_id_fkey" FOREIGN KEY ("field_submission_id") REFERENCES "partner"."field_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."field_submission_asset" ADD CONSTRAINT "field_submission_asset_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "core"."asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

