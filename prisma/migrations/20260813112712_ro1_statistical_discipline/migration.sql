-- AlterTable
ALTER TABLE "research"."conclusion" ADD COLUMN     "is_comparative" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "provenance_class" "core"."ProvenanceClass" NOT NULL;

-- AlterTable
ALTER TABLE "research"."experiment" ADD COLUMN     "control_treatment_batch_id" UUID,
ADD COLUMN     "declared_limitations" TEXT,
ADD COLUMN     "derivation_note" TEXT,
ADD COLUMN     "derived_from_experiment_id" UUID;

-- AlterTable
ALTER TABLE "research"."variable_catalog_value" ADD COLUMN     "alias_of_id" UUID,
ADD COLUMN     "definition" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "experiment_control_treatment_batch_id_key" ON "research"."experiment"("control_treatment_batch_id");

-- CreateIndex
CREATE INDEX "experiment_derived_from_experiment_id_idx" ON "research"."experiment"("derived_from_experiment_id");

-- CreateIndex
CREATE INDEX "variable_catalog_value_alias_of_id_idx" ON "research"."variable_catalog_value"("alias_of_id");

-- AddForeignKey
ALTER TABLE "research"."experiment" ADD CONSTRAINT "experiment_control_treatment_batch_id_fkey" FOREIGN KEY ("control_treatment_batch_id") REFERENCES "research"."treatment_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."experiment" ADD CONSTRAINT "experiment_derived_from_experiment_id_fkey" FOREIGN KEY ("derived_from_experiment_id") REFERENCES "research"."experiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research"."variable_catalog_value" ADD CONSTRAINT "variable_catalog_value_alias_of_id_fkey" FOREIGN KEY ("alias_of_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;

