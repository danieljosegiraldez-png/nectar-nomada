-- El grado de proceso y el estado de la cereza, como columnas y no como prosa.
--
-- POR QUÉ. Estaban dentro del texto de `lot_process.intent` —«40 kg cereza
-- entera, natural anaeróbico»— y ahí no se puede agrupar: comparar los naturales
-- contra los honeys exigía leer prosa. Decisión de Daniel del 2026-09-07.
--
-- SALEN DE CATÁLOGOS QUE YA EXISTEN. `grado_proceso` (Natural, Washed, Semi Wash
-- 50%, Semi Wash 75%, Honey) y `estado_cereza` (entera, despulpada), definidos en
-- `lib/research/catalogs.ts`. No se crea vocabulario nuevo, y por eso las FK
-- apuntan a `research.variable_catalog_value` como ya hacen `lot_transformation`
-- y `processing_stage`.
--
-- ANULABLES a propósito: los procesos que ya existan no las tienen, y deducir
-- «natural» de la ausencia de fermentación sería inferir un hecho y guardarlo
-- como tal. El reporte los agrupa como «Sin declarar», igual que «Sin receta».

-- AlterTable
ALTER TABLE "traceability"."lot_process" ADD COLUMN     "process_grade_value_id" UUID,
ADD COLUMN     "cherry_state_value_id" UUID;

-- CreateIndex
CREATE INDEX "lot_process_process_grade_value_id_idx" ON "traceability"."lot_process"("process_grade_value_id");
CREATE INDEX "lot_process_cherry_state_value_id_idx" ON "traceability"."lot_process"("cherry_state_value_id");

-- AddForeignKey
ALTER TABLE "traceability"."lot_process" ADD CONSTRAINT "lot_process_process_grade_value_id_fkey"
  FOREIGN KEY ("process_grade_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process" ADD CONSTRAINT "lot_process_cherry_state_value_id_fkey"
  FOREIGN KEY ("cherry_state_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
