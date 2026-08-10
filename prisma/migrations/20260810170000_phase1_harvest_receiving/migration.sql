-- AlterEnum
ALTER TYPE "core"."LocationType" ADD VALUE 'plot';

-- CreateTable
CREATE TABLE "traceability"."harvest_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID,
    "harvested_at" TIMESTAMP(3) NOT NULL,
    "cultivar_notes" TEXT,
    "cherry_weight_kg" DECIMAL(10,3),
    "brix" DECIMAL(5,2),
    "temperature_c" DECIMAL(5,2),
    "condition" TEXT,
    "ripeness_notes" TEXT,
    "operator_person_id" UUID,
    "notes" TEXT,
    "resulting_lot_id" UUID NOT NULL,
    "provenance_class" "core"."ProvenanceClass" NOT NULL DEFAULT 'direct_observation',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "harvest_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."receiving_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID,
    "project_id" UUID,
    "received_at" TIMESTAMP(3) NOT NULL,
    "delivery_note" TEXT,
    "cultivar_notes" TEXT,
    "cherry_weight_kg" DECIMAL(10,3),
    "brix" DECIMAL(5,2),
    "temperature_c" DECIMAL(5,2),
    "condition" TEXT,
    "operator_person_id" UUID,
    "notes" TEXT,
    "resulting_lot_id" UUID NOT NULL,
    "provenance_class" "core"."ProvenanceClass" NOT NULL DEFAULT 'direct_observation',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "receiving_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "harvest_event_resulting_lot_id_key" ON "traceability"."harvest_event"("resulting_lot_id");

-- CreateIndex
CREATE INDEX "harvest_event_location_id_idx" ON "traceability"."harvest_event"("location_id");

-- CreateIndex
CREATE INDEX "harvest_event_organization_id_idx" ON "traceability"."harvest_event"("organization_id");

-- CreateIndex
CREATE INDEX "harvest_event_project_id_idx" ON "traceability"."harvest_event"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "receiving_event_resulting_lot_id_key" ON "traceability"."receiving_event"("resulting_lot_id");

-- CreateIndex
CREATE INDEX "receiving_event_organization_id_idx" ON "traceability"."receiving_event"("organization_id");

-- CreateIndex
CREATE INDEX "receiving_event_location_id_idx" ON "traceability"."receiving_event"("location_id");

-- CreateIndex
CREATE INDEX "receiving_event_project_id_idx" ON "traceability"."receiving_event"("project_id");

-- AddForeignKey
ALTER TABLE "traceability"."harvest_event" ADD CONSTRAINT "harvest_event_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."harvest_event" ADD CONSTRAINT "harvest_event_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."harvest_event" ADD CONSTRAINT "harvest_event_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."harvest_event" ADD CONSTRAINT "harvest_event_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."harvest_event" ADD CONSTRAINT "harvest_event_resulting_lot_id_fkey" FOREIGN KEY ("resulting_lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."harvest_event" ADD CONSTRAINT "harvest_event_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."receiving_event" ADD CONSTRAINT "receiving_event_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."receiving_event" ADD CONSTRAINT "receiving_event_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."receiving_event" ADD CONSTRAINT "receiving_event_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."receiving_event" ADD CONSTRAINT "receiving_event_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."receiving_event" ADD CONSTRAINT "receiving_event_resulting_lot_id_fkey" FOREIGN KEY ("resulting_lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."receiving_event" ADD CONSTRAINT "receiving_event_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

