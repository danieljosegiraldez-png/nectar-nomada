-- CreateTable
CREATE TABLE "traceability"."storage_assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lot_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "container_note" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "storage_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storage_assignment_lot_id_idx" ON "traceability"."storage_assignment"("lot_id");

-- CreateIndex
CREATE INDEX "storage_assignment_location_id_idx" ON "traceability"."storage_assignment"("location_id");

-- AddForeignKey
ALTER TABLE "traceability"."measurement" ADD CONSTRAINT "measurement_storage_assignment_id_fkey" FOREIGN KEY ("storage_assignment_id") REFERENCES "traceability"."storage_assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."storage_assignment" ADD CONSTRAINT "storage_assignment_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."storage_assignment" ADD CONSTRAINT "storage_assignment_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."storage_assignment" ADD CONSTRAINT "storage_assignment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

