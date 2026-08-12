-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "apiary";

-- CreateEnum
CREATE TYPE "apiary"."HiveStatus" AS ENUM ('active', 'empty', 'retired');

-- CreateEnum
CREATE TYPE "apiary"."ColonyStatus" AS ENUM ('active', 'dead', 'absconded');

-- AlterEnum
ALTER TYPE "core"."LocationType" ADD VALUE 'apiary_site';

-- CreateTable
CREATE TABLE "apiary"."hive" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identifier" TEXT NOT NULL,
    "location_id" UUID NOT NULL,
    "project_id" UUID,
    "installed_at" TIMESTAMP(3),
    "status" "apiary"."HiveStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "hive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apiary"."colony" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_id" UUID NOT NULL,
    "status" "apiary"."ColonyStatus" NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMP(3) NOT NULL,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "data_quality" "core"."DataQuality",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "colony_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hive_location_id_idx" ON "apiary"."hive"("location_id");

-- CreateIndex
CREATE INDEX "hive_project_id_idx" ON "apiary"."hive"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "hive_location_id_identifier_key" ON "apiary"."hive"("location_id", "identifier");

-- CreateIndex
CREATE INDEX "colony_hive_id_idx" ON "apiary"."colony"("hive_id");

-- AddForeignKey
ALTER TABLE "apiary"."hive" ADD CONSTRAINT "hive_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."hive" ADD CONSTRAINT "hive_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."hive" ADD CONSTRAINT "hive_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "apiary"."hive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
