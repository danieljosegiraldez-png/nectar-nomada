-- CreateEnum
CREATE TYPE "core"."RecordStatus" AS ENUM ('draft', 'incomplete', 'pending_review', 'verified', 'approved', 'archived', 'rejected');

-- CreateEnum
CREATE TYPE "core"."ClassificationLevel" AS ENUM ('public', 'registered', 'partner', 'internal', 'confidential', 'trade_secret');

-- CreateEnum
CREATE TYPE "core"."LocationType" AS ENUM ('country', 'province', 'district', 'locality', 'site');

-- CreateEnum
CREATE TYPE "core"."OrganizationType" AS ENUM ('farm', 'estate', 'producer', 'roaster', 'brewery', 'winery', 'distillery', 'apiary', 'laboratory', 'restaurant', 'venue', 'association', 'university', 'supplier', 'tour_operator', 'nectar_nomada_partner');

-- CreateTable
CREATE TABLE "core"."location" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_type" "core"."LocationType" NOT NULL,
    "parent_location_id" UUID,
    "organization_id" UUID,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "altitude_meters" DOUBLE PRECISION,
    "timezone" TEXT,
    "status" "core"."RecordStatus" NOT NULL DEFAULT 'draft',
    "classification" "core"."ClassificationLevel" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."organization" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_type" "core"."OrganizationType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "attributes" JSONB,
    "status" "core"."RecordStatus" NOT NULL DEFAULT 'draft',
    "classification" "core"."ClassificationLevel" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."program" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "core"."RecordStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."domain_tag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "domain_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."project" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "program_id" UUID,
    "organization_id" UUID,
    "client_organization_id" UUID,
    "client_person_id" UUID,
    "primary_location_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "core"."RecordStatus" NOT NULL DEFAULT 'draft',
    "classification" "core"."ClassificationLevel" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."project_domain_tag" (
    "project_id" UUID NOT NULL,
    "domain_tag_id" UUID NOT NULL,

    CONSTRAINT "project_domain_tag_pkey" PRIMARY KEY ("project_id","domain_tag_id")
);

-- CreateTable
CREATE TABLE "core"."sample" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sample_code" TEXT NOT NULL,
    "sample_type" TEXT NOT NULL,
    "description" TEXT,
    "project_id" UUID,
    "organization_id" UUID,
    "location_id" UUID,
    "status" "core"."RecordStatus" NOT NULL DEFAULT 'draft',
    "classification" "core"."ClassificationLevel" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "sample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_parent_location_id_idx" ON "core"."location"("parent_location_id");

-- CreateIndex
CREATE INDEX "location_organization_id_idx" ON "core"."location"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "domain_tag_slug_key" ON "core"."domain_tag"("slug");

-- CreateIndex
CREATE INDEX "project_program_id_idx" ON "core"."project"("program_id");

-- CreateIndex
CREATE INDEX "project_organization_id_idx" ON "core"."project"("organization_id");

-- CreateIndex
CREATE INDEX "project_client_organization_id_idx" ON "core"."project"("client_organization_id");

-- CreateIndex
CREATE INDEX "project_primary_location_id_idx" ON "core"."project"("primary_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "sample_sample_code_key" ON "core"."sample"("sample_code");

-- CreateIndex
CREATE INDEX "sample_project_id_idx" ON "core"."sample"("project_id");

-- CreateIndex
CREATE INDEX "sample_organization_id_idx" ON "core"."sample"("organization_id");

-- CreateIndex
CREATE INDEX "sample_location_id_idx" ON "core"."sample"("location_id");

-- AddForeignKey
ALTER TABLE "core"."location" ADD CONSTRAINT "location_parent_location_id_fkey" FOREIGN KEY ("parent_location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."location" ADD CONSTRAINT "location_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."location" ADD CONSTRAINT "location_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."organization" ADD CONSTRAINT "organization_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."program" ADD CONSTRAINT "program_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."project" ADD CONSTRAINT "project_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "core"."program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."project" ADD CONSTRAINT "project_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."project" ADD CONSTRAINT "project_client_organization_id_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."project" ADD CONSTRAINT "project_client_person_id_fkey" FOREIGN KEY ("client_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."project" ADD CONSTRAINT "project_primary_location_id_fkey" FOREIGN KEY ("primary_location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."project" ADD CONSTRAINT "project_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."project_domain_tag" ADD CONSTRAINT "project_domain_tag_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."project_domain_tag" ADD CONSTRAINT "project_domain_tag_domain_tag_id_fkey" FOREIGN KEY ("domain_tag_id") REFERENCES "core"."domain_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."sample" ADD CONSTRAINT "sample_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."sample" ADD CONSTRAINT "sample_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."sample" ADD CONSTRAINT "sample_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."sample" ADD CONSTRAINT "sample_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
