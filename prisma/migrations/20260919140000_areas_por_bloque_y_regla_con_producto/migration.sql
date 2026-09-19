-- Manejo fitosanitario de la parcela, PR B (Tarea 1). Spec 2026-09-19.
-- El bloque como área de una intervención, y el producto que sugiere una regla
-- de trampa. Generado con `prisma migrate diff --from-migrations --to-schema`,
-- sin cambios ajenos: `specimen_id` conserva su FK `ON DELETE RESTRICT` porque
-- el esquema lo declara explícito (ver comentario en `PlotInterventionArea`).

-- AlterTable
ALTER TABLE "traceability"."plot_intervention_area" ADD COLUMN     "plot_block_id" UUID,
ALTER COLUMN "specimen_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "traceability"."trap_rule" ADD COLUMN     "suggested_material_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "plot_intervention_area_intervention_id_plot_block_id_key" ON "traceability"."plot_intervention_area"("intervention_id", "plot_block_id");

-- AddForeignKey
ALTER TABLE "traceability"."plot_intervention_area" ADD CONSTRAINT "plot_intervention_area_plot_block_id_fkey" FOREIGN KEY ("plot_block_id") REFERENCES "traceability"."plot_block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."trap_rule" ADD CONSTRAINT "trap_rule_suggested_material_id_fkey" FOREIGN KEY ("suggested_material_id") REFERENCES "traceability"."consumable_material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un área es una planta O un bloque, nunca los dos ni ninguno. `num_nonnulls`
-- nunca evalúa a NULL (cuenta columnas, no las compara), así que no hace falta
-- un IS NOT NULL adicional para que el CHECK muerda en los dos sentidos.
ALTER TABLE "traceability"."plot_intervention_area"
  ADD CONSTRAINT "plot_intervention_area_planta_o_bloque"
  CHECK (num_nonnulls("specimen_id", "plot_block_id") = 1);
