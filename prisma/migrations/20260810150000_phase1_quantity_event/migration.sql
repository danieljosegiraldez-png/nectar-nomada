-- CreateEnum
CREATE TYPE "traceability"."QuantityEventType" AS ENUM ('received', 'process_output', 'loss', 'sample_removed', 'adjustment_increase', 'adjustment_decrease', 'transfer_in', 'transfer_out');

-- CreateTable
CREATE TABLE "traceability"."quantity_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lot_id" UUID NOT NULL,
    "event_type" "traceability"."QuantityEventType" NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "transformation_id" UUID,
    "provenance_class" "core"."ProvenanceClass" NOT NULL DEFAULT 'direct_observation',
    "data_quality" "core"."DataQuality",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "quantity_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quantity_event_lot_id_idx" ON "traceability"."quantity_event"("lot_id");

-- CreateIndex
CREATE INDEX "quantity_event_transformation_id_idx" ON "traceability"."quantity_event"("transformation_id");

-- AddForeignKey
ALTER TABLE "traceability"."quantity_event" ADD CONSTRAINT "quantity_event_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."quantity_event" ADD CONSTRAINT "quantity_event_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "traceability"."lot_transformation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."quantity_event" ADD CONSTRAINT "quantity_event_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- quantity is always a non-negative magnitude; direction is derived from
-- event_type (lib/traceability/quantity.ts), never a signed value stored
-- here. Not expressible in schema.prisma, added by hand per established
-- convention for constraints outside Prisma's declarative surface.
ALTER TABLE "traceability"."quantity_event" ADD CONSTRAINT "quantity_event_quantity_nonneg" CHECK ("quantity" >= 0);

