-- Manejo fitosanitario de la parcela, PR A. Spec 2026-09-18.
-- Carencia y reentrada: nulo = no declarada, 0 = declarada cero. Sin DEFAULT.
-- Los CHECK viven en la base: un importador o SQL directo se salta el servicio.

-- CreateEnum
CREATE TYPE "traceability"."PlotInterventionKind" AS ENUM ('aplicacion', 'liberacion', 'manejo_cultural');

-- CreateEnum
CREATE TYPE "traceability"."PlotInterventionTarget" AS ENUM ('arana_roja', 'broca', 'minador_hoja', 'cochinillas', 'nematodos', 'jobotos', 'roya', 'ojo_de_gallo', 'mancha_de_hierro', 'antracnosis', 'llaga_macana', 'chasparria', 'otro');

-- CreateEnum
CREATE TYPE "traceability"."PlotInterventionMethod" AS ENUM ('follaje', 'tronco', 'suelo', 'riego', 'cebo', 'liberacion', 'manual', 'otro');

-- AlterTable
ALTER TABLE "traceability"."consumable_material" ADD COLUMN     "default_reentry_hours" INTEGER,
ADD COLUMN     "is_plant_protection" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "traceability"."field_event" ADD COLUMN     "plot_intervention_id" UUID;

-- CreateTable
CREATE TABLE "traceability"."plot_intervention" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "kind" "traceability"."PlotInterventionKind" NOT NULL,
    "target" "traceability"."PlotInterventionTarget" NOT NULL,
    "target_note" TEXT,
    "method" "traceability"."PlotInterventionMethod",
    "mix_volume" DECIMAL(10,3),
    "mix_unit" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "operator_person_id" UUID,
    "field_session_id" UUID,
    "motivo_observation_id" UUID,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "data_quality" "core"."DataQuality",
    "notes" TEXT,
    "corrects_id" UUID,
    "correction_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "plot_intervention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."plot_intervention_area" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "intervention_id" UUID NOT NULL,
    "specimen_id" UUID NOT NULL,

    CONSTRAINT "plot_intervention_area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."plot_intervention_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "intervention_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "consumable_lot_id" UUID,
    "quantity" DECIMAL(10,3),
    "unit" TEXT,
    "withdrawal_days" INTEGER,
    "reentry_hours" INTEGER,
    "lot_expired_at_application" BOOLEAN,

    CONSTRAINT "plot_intervention_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."harvest_withdrawal_flag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "harvest_event_id" UUID NOT NULL,
    "intervention_id" UUID NOT NULL,
    "dias_que_faltaban" INTEGER,

    CONSTRAINT "harvest_withdrawal_flag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plot_intervention_location_id_occurred_at_idx" ON "traceability"."plot_intervention"("location_id", "occurred_at");

-- CreateIndex
CREATE INDEX "plot_intervention_corrects_id_idx" ON "traceability"."plot_intervention"("corrects_id");

-- CreateIndex
CREATE UNIQUE INDEX "plot_intervention_area_intervention_id_specimen_id_key" ON "traceability"."plot_intervention_area"("intervention_id", "specimen_id");

-- CreateIndex
CREATE INDEX "plot_intervention_line_intervention_id_idx" ON "traceability"."plot_intervention_line"("intervention_id");

-- CreateIndex
CREATE UNIQUE INDEX "harvest_withdrawal_flag_harvest_event_id_intervention_id_key" ON "traceability"."harvest_withdrawal_flag"("harvest_event_id", "intervention_id");

-- CreateIndex
CREATE INDEX "field_event_plot_intervention_id_idx" ON "traceability"."field_event"("plot_intervention_id");

-- AddForeignKey
ALTER TABLE "traceability"."plot_intervention" ADD CONSTRAINT "plot_intervention_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."plot_intervention" ADD CONSTRAINT "plot_intervention_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."plot_intervention" ADD CONSTRAINT "plot_intervention_field_session_id_fkey" FOREIGN KEY ("field_session_id") REFERENCES "traceability"."field_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."plot_intervention" ADD CONSTRAINT "plot_intervention_motivo_observation_id_fkey" FOREIGN KEY ("motivo_observation_id") REFERENCES "traceability"."specimen_observation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."plot_intervention" ADD CONSTRAINT "plot_intervention_corrects_id_fkey" FOREIGN KEY ("corrects_id") REFERENCES "traceability"."plot_intervention"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."plot_intervention" ADD CONSTRAINT "plot_intervention_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."plot_intervention_area" ADD CONSTRAINT "plot_intervention_area_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "traceability"."plot_intervention"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."plot_intervention_area" ADD CONSTRAINT "plot_intervention_area_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "traceability"."specimen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."plot_intervention_line" ADD CONSTRAINT "plot_intervention_line_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "traceability"."plot_intervention"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."plot_intervention_line" ADD CONSTRAINT "plot_intervention_line_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "traceability"."consumable_material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."plot_intervention_line" ADD CONSTRAINT "plot_intervention_line_consumable_lot_id_fkey" FOREIGN KEY ("consumable_lot_id") REFERENCES "traceability"."consumable_lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."harvest_withdrawal_flag" ADD CONSTRAINT "harvest_withdrawal_flag_harvest_event_id_fkey" FOREIGN KEY ("harvest_event_id") REFERENCES "traceability"."harvest_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."harvest_withdrawal_flag" ADD CONSTRAINT "harvest_withdrawal_flag_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "traceability"."plot_intervention"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."field_event" ADD CONSTRAINT "field_event_plot_intervention_id_fkey" FOREIGN KEY ("plot_intervention_id") REFERENCES "traceability"."plot_intervention"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "traceability"."consumable_material"
  ADD CONSTRAINT "consumable_material_reentrada_no_negativa"
  CHECK ("default_reentry_hours" IS NULL OR "default_reentry_hours" >= 0);

ALTER TABLE "traceability"."plot_intervention_line"
  ADD CONSTRAINT "plot_intervention_line_carencia_no_negativa"
  CHECK ("withdrawal_days" IS NULL OR "withdrawal_days" >= 0);
ALTER TABLE "traceability"."plot_intervention_line"
  ADD CONSTRAINT "plot_intervention_line_reentrada_no_negativa"
  CHECK ("reentry_hours" IS NULL OR "reentry_hours" >= 0);
ALTER TABLE "traceability"."plot_intervention_line"
  ADD CONSTRAINT "plot_intervention_line_marca_de_vencimiento_exige_frasco"
  CHECK ("consumable_lot_id" IS NOT NULL OR "lot_expired_at_application" IS NULL);

ALTER TABLE "traceability"."harvest_withdrawal_flag"
  ADD CONSTRAINT "harvest_withdrawal_flag_dias_no_negativos"
  CHECK ("dias_que_faltaban" IS NULL OR "dias_que_faltaban" > 0);

-- Una corrección lleva motivo. «Otro» lleva su nota.
--
-- Desviación del brief, decisión del controlador: el SQL original comparaba
-- con `length(btrim(x)) > 0` dentro de un OR. Con `x` NULL, `btrim(NULL)` es
-- NULL, `length(NULL) > 0` es NULL, y `FALSE OR NULL` es NULL — Postgres NO
-- rechaza una fila cuyo CHECK evalúa a NULL (sólo rechaza FALSE), así que la
-- fila entraba sin nota. Confirmado con la propia prueba del Paso 4 en rojo
-- (`otro sin nota se rechaza` fallaba: "promise resolved instead of
-- rejecting") y con una segunda sonda directa para `correccion_con_motivo`
-- (la prueba del brief no lo detecta porque usa `"  "`, no NULL, como valor
-- rechazado). Arreglo: exigir explícitamente `IS NOT NULL` antes del `btrim`.
ALTER TABLE "traceability"."plot_intervention"
  ADD CONSTRAINT "plot_intervention_correccion_con_motivo"
  CHECK ("corrects_id" IS NULL OR ("correction_reason" IS NOT NULL AND length(btrim("correction_reason")) > 0));
ALTER TABLE "traceability"."plot_intervention"
  ADD CONSTRAINT "plot_intervention_otro_con_nota"
  CHECK ("target" <> 'otro' OR ("target_note" IS NOT NULL AND length(btrim("target_note")) > 0));
