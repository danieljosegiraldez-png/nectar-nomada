-- CreateEnum
CREATE TYPE "traceability"."DryingTurnEventType" AS ENUM ('turned', 'covered', 'uncovered', 'other');

-- AlterTable
ALTER TABLE "traceability"."lot_transformation" ADD COLUMN     "drying_run_id" UUID;

-- CreateTable
CREATE TABLE "traceability"."drying_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "method" TEXT,
    "location_id" UUID,
    "layer_depth_cm" DECIMAL(6,2),
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "drying_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."drying_turn_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "drying_run_id" UUID NOT NULL,
    "event_type" "traceability"."DryingTurnEventType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "operator_person_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "drying_turn_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drying_run_location_id_idx" ON "traceability"."drying_run"("location_id");

-- CreateIndex
CREATE INDEX "drying_turn_event_drying_run_id_idx" ON "traceability"."drying_turn_event"("drying_run_id");

-- CreateIndex
CREATE INDEX "lot_transformation_drying_run_id_idx" ON "traceability"."lot_transformation"("drying_run_id");

-- AddForeignKey
ALTER TABLE "traceability"."lot_transformation" ADD CONSTRAINT "lot_transformation_drying_run_id_fkey" FOREIGN KEY ("drying_run_id") REFERENCES "traceability"."drying_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."measurement" ADD CONSTRAINT "measurement_drying_run_id_fkey" FOREIGN KEY ("drying_run_id") REFERENCES "traceability"."drying_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."drying_run" ADD CONSTRAINT "drying_run_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."drying_run" ADD CONSTRAINT "drying_run_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."drying_turn_event" ADD CONSTRAINT "drying_turn_event_drying_run_id_fkey" FOREIGN KEY ("drying_run_id") REFERENCES "traceability"."drying_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."drying_turn_event" ADD CONSTRAINT "drying_turn_event_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."drying_turn_event" ADD CONSTRAINT "drying_turn_event_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

