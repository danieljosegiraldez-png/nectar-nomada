-- AlterTable
ALTER TABLE "traceability"."drying_turn_event" ADD COLUMN     "turn_batch_id" UUID;

-- CreateTable
CREATE TABLE "traceability"."drying_turn_batch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "operator_person_id" UUID,
    "notes" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "source_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "drying_turn_batch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drying_turn_batch_occurred_at_idx" ON "traceability"."drying_turn_batch"("occurred_at");

-- CreateIndex
CREATE INDEX "drying_turn_event_turn_batch_id_idx" ON "traceability"."drying_turn_event"("turn_batch_id");

-- AddForeignKey
ALTER TABLE "traceability"."drying_turn_event" ADD CONSTRAINT "drying_turn_event_turn_batch_id_fkey" FOREIGN KEY ("turn_batch_id") REFERENCES "traceability"."drying_turn_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."drying_turn_batch" ADD CONSTRAINT "drying_turn_batch_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."drying_turn_batch" ADD CONSTRAINT "drying_turn_batch_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
