-- CreateTable
CREATE TABLE "traceability"."labour_entry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "harvest_event_id" UUID,
    "receiving_event_id" UUID,
    "fermentation_run_id" UUID,
    "drying_run_id" UUID,
    "worker_count" INTEGER NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "task_note" TEXT,
    "provided_by_organization_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operator_person_id" UUID,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "data_quality" "core"."DataQuality",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "labour_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."material_consumption_entry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fermentation_run_id" UUID,
    "drying_run_id" UUID,
    "material_name" TEXT NOT NULL,
    "batch_label" TEXT NOT NULL,
    "quantity" DECIMAL(10,3),
    "unit" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operator_person_id" UUID,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "data_quality" "core"."DataQuality",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "material_consumption_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "labour_entry_harvest_event_id_idx" ON "traceability"."labour_entry"("harvest_event_id");

-- CreateIndex
CREATE INDEX "labour_entry_receiving_event_id_idx" ON "traceability"."labour_entry"("receiving_event_id");

-- CreateIndex
CREATE INDEX "labour_entry_fermentation_run_id_idx" ON "traceability"."labour_entry"("fermentation_run_id");

-- CreateIndex
CREATE INDEX "labour_entry_drying_run_id_idx" ON "traceability"."labour_entry"("drying_run_id");

-- CreateIndex
CREATE INDEX "material_consumption_entry_fermentation_run_id_idx" ON "traceability"."material_consumption_entry"("fermentation_run_id");

-- CreateIndex
CREATE INDEX "material_consumption_entry_drying_run_id_idx" ON "traceability"."material_consumption_entry"("drying_run_id");

-- AddForeignKey
ALTER TABLE "traceability"."labour_entry" ADD CONSTRAINT "labour_entry_harvest_event_id_fkey" FOREIGN KEY ("harvest_event_id") REFERENCES "traceability"."harvest_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."labour_entry" ADD CONSTRAINT "labour_entry_receiving_event_id_fkey" FOREIGN KEY ("receiving_event_id") REFERENCES "traceability"."receiving_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."labour_entry" ADD CONSTRAINT "labour_entry_fermentation_run_id_fkey" FOREIGN KEY ("fermentation_run_id") REFERENCES "traceability"."fermentation_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."labour_entry" ADD CONSTRAINT "labour_entry_drying_run_id_fkey" FOREIGN KEY ("drying_run_id") REFERENCES "traceability"."drying_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."labour_entry" ADD CONSTRAINT "labour_entry_provided_by_organization_id_fkey" FOREIGN KEY ("provided_by_organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."labour_entry" ADD CONSTRAINT "labour_entry_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."labour_entry" ADD CONSTRAINT "labour_entry_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."material_consumption_entry" ADD CONSTRAINT "material_consumption_entry_fermentation_run_id_fkey" FOREIGN KEY ("fermentation_run_id") REFERENCES "traceability"."fermentation_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."material_consumption_entry" ADD CONSTRAINT "material_consumption_entry_drying_run_id_fkey" FOREIGN KEY ("drying_run_id") REFERENCES "traceability"."drying_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."material_consumption_entry" ADD CONSTRAINT "material_consumption_entry_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."material_consumption_entry" ADD CONSTRAINT "material_consumption_entry_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
