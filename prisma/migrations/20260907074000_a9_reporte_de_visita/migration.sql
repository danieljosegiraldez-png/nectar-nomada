-- A9.6 (D7) — el reporte de visita que se entrega al cliente.
--
-- El esquema NO se inventa aquí: es el que
-- `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md:501-507` especificó y ADR-020
-- aprobó como arquitectura. Estrenar tabla propia lo habría convertido en el
-- cuarto mecanismo de versionado del repositorio.
--
-- Aditiva entera: esquema nuevo, ninguna tabla existente cambia.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "reporting";

-- CreateEnum
CREATE TYPE "reporting"."ReportType" AS ENUM ('lot', 'experiment', 'farm', 'consulting', 'sensory');

-- CreateEnum
CREATE TYPE "reporting"."ReportStatus" AS ENUM ('draft', 'issued', 'withdrawn');

-- CreateEnum
CREATE TYPE "reporting"."ReportSurface" AS ENUM ('web', 'pdf', 'client_portal', 'download');

-- DropForeignKey
ALTER TABLE "sensory"."assessment" DROP CONSTRAINT "assessment_evaluator_user_account_id_fkey";

-- DropForeignKey
ALTER TABLE "sensory"."assessment" DROP CONSTRAINT "assessment_external_evaluator_person_id_fkey";

-- CreateTable
CREATE TABLE "reporting"."report" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_type" "reporting"."ReportType" NOT NULL,
    "subject_entity_type" TEXT NOT NULL,
    "subject_entity_id" UUID NOT NULL,
    "status" "reporting"."ReportStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting"."report_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generation_query" JSONB NOT NULL,
    "rendered_snapshot" JSONB NOT NULL,
    "generated_by" UUID,

    CONSTRAINT "report_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting"."report_publication" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_version_id" UUID NOT NULL,
    "surface" "reporting"."ReportSurface" NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_publication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_subject_entity_type_subject_entity_id_idx" ON "reporting"."report"("subject_entity_type", "subject_entity_id");

-- CreateIndex
CREATE INDEX "report_version_report_id_idx" ON "reporting"."report_version"("report_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_version_report_id_version_key" ON "reporting"."report_version"("report_id", "version");

-- CreateIndex
CREATE INDEX "report_publication_report_version_id_idx" ON "reporting"."report_publication"("report_version_id");

-- AddForeignKey
ALTER TABLE "sensory"."assessment" ADD CONSTRAINT "assessment_evaluator_user_account_id_fkey" FOREIGN KEY ("evaluator_user_account_id") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."assessment" ADD CONSTRAINT "assessment_external_evaluator_person_id_fkey" FOREIGN KEY ("external_evaluator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting"."report" ADD CONSTRAINT "report_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting"."report_version" ADD CONSTRAINT "report_version_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reporting"."report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting"."report_version" ADD CONSTRAINT "report_version_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting"."report_publication" ADD CONSTRAINT "report_publication_report_version_id_fkey" FOREIGN KEY ("report_version_id") REFERENCES "reporting"."report_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

