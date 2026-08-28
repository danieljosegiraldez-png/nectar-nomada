-- CreateEnum
CREATE TYPE "traceability"."ProcessTargetMoment" AS ENUM ('initial', 'during', 'final');

-- DropForeignKey
ALTER TABLE "traceability"."lot" DROP CONSTRAINT "lot_organization_id_fkey";

-- AlterTable
ALTER TABLE "traceability"."fermentation_run" ADD COLUMN     "process_recipe_version_id" UUID;

-- CreateTable
CREATE TABLE "traceability"."process_recipe" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organization_id" UUID,
    "status" "core"."RecordStatus" NOT NULL DEFAULT 'draft',
    "classification" "core"."ClassificationLevel" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "process_recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."process_recipe_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipe_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "notes" TEXT,
    "status" "core"."RecordStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "process_recipe_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."process_target" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipe_version_id" UUID NOT NULL,
    "variable" TEXT NOT NULL,
    "moment" "traceability"."ProcessTargetMoment" NOT NULL,
    "target_value" DECIMAL(12,4),
    "min_value" DECIMAL(12,4),
    "max_value" DECIMAL(12,4),
    "unit" TEXT NOT NULL,
    "note" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "process_target_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "process_recipe_organization_id_idx" ON "traceability"."process_recipe"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "process_recipe_organization_id_name_key" ON "traceability"."process_recipe"("organization_id", "name");

-- CreateIndex
CREATE INDEX "process_recipe_version_recipe_id_idx" ON "traceability"."process_recipe_version"("recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "process_recipe_version_recipe_id_version_key" ON "traceability"."process_recipe_version"("recipe_id", "version");

-- CreateIndex
CREATE INDEX "process_target_recipe_version_id_idx" ON "traceability"."process_target"("recipe_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "process_target_recipe_version_id_variable_moment_key" ON "traceability"."process_target"("recipe_version_id", "variable", "moment");

-- CreateIndex
CREATE INDEX "fermentation_run_process_recipe_version_id_idx" ON "traceability"."fermentation_run"("process_recipe_version_id");

-- AddForeignKey
ALTER TABLE "traceability"."lot" ADD CONSTRAINT "lot_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."fermentation_run" ADD CONSTRAINT "fermentation_run_process_recipe_version_id_fkey" FOREIGN KEY ("process_recipe_version_id") REFERENCES "traceability"."process_recipe_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe" ADD CONSTRAINT "process_recipe_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe" ADD CONSTRAINT "process_recipe_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_version" ADD CONSTRAINT "process_recipe_version_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "traceability"."process_recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_version" ADD CONSTRAINT "process_recipe_version_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_target" ADD CONSTRAINT "process_target_recipe_version_id_fkey" FOREIGN KEY ("recipe_version_id") REFERENCES "traceability"."process_recipe_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "traceability"."harvest_event_source_harvest_event_id_location_id_planting_key" RENAME TO "harvest_event_source_harvest_event_id_location_id_planting__key";
