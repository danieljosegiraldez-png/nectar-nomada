-- AlterEnum
ALTER TYPE "traceability"."LotType" ADD VALUE 'honey';

-- CreateTable
CREATE TABLE "apiary"."apiary_harvest_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "colony_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "extracted_weight_kg" DECIMAL(10,3),
    "frames_harvested" INTEGER,
    "operator_person_id" UUID,
    "notes" TEXT,
    "resulting_lot_id" UUID NOT NULL,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "source_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "apiary_harvest_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "apiary_harvest_event_resulting_lot_id_key" ON "apiary"."apiary_harvest_event"("resulting_lot_id");

-- CreateIndex
CREATE INDEX "apiary_harvest_event_colony_id_idx" ON "apiary"."apiary_harvest_event"("colony_id");

-- AddForeignKey
ALTER TABLE "apiary"."apiary_harvest_event" ADD CONSTRAINT "apiary_harvest_event_colony_id_fkey" FOREIGN KEY ("colony_id") REFERENCES "apiary"."colony"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."apiary_harvest_event" ADD CONSTRAINT "apiary_harvest_event_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."apiary_harvest_event" ADD CONSTRAINT "apiary_harvest_event_resulting_lot_id_fkey" FOREIGN KEY ("resulting_lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."apiary_harvest_event" ADD CONSTRAINT "apiary_harvest_event_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
