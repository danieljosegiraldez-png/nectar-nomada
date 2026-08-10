-- CreateEnum
CREATE TYPE "traceability"."FermentationInterventionType" AS ENUM ('inoculation', 'agitation', 'purge', 'addition', 'sample', 'transfer', 'termination', 'other');

-- AlterTable
ALTER TABLE "traceability"."lot_transformation" ADD COLUMN     "fermentation_run_id" UUID;

-- CreateTable
CREATE TABLE "traceability"."fermentation_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vessel_note" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "operator_person_id" UUID,
    "inoculated" BOOLEAN NOT NULL DEFAULT false,
    "inoculation_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "fermentation_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."fermentation_intervention" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fermentation_run_id" UUID NOT NULL,
    "intervention_type" "traceability"."FermentationInterventionType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "fermentation_intervention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fermentation_intervention_fermentation_run_id_idx" ON "traceability"."fermentation_intervention"("fermentation_run_id");

-- CreateIndex
CREATE INDEX "lot_transformation_fermentation_run_id_idx" ON "traceability"."lot_transformation"("fermentation_run_id");

-- AddForeignKey
ALTER TABLE "traceability"."lot_transformation" ADD CONSTRAINT "lot_transformation_fermentation_run_id_fkey" FOREIGN KEY ("fermentation_run_id") REFERENCES "traceability"."fermentation_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."measurement" ADD CONSTRAINT "measurement_fermentation_run_id_fkey" FOREIGN KEY ("fermentation_run_id") REFERENCES "traceability"."fermentation_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."fermentation_run" ADD CONSTRAINT "fermentation_run_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."fermentation_run" ADD CONSTRAINT "fermentation_run_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."fermentation_intervention" ADD CONSTRAINT "fermentation_intervention_fermentation_run_id_fkey" FOREIGN KEY ("fermentation_run_id") REFERENCES "traceability"."fermentation_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."fermentation_intervention" ADD CONSTRAINT "fermentation_intervention_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

