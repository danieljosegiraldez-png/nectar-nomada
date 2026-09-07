-- El proceso por el que pasa un lote: la secuencia, no una etiqueta.
--
-- POR QUÉ. Hasta hoy `process_recipe_version_id` vivía en UN solo sitio:
-- `fermentation_run`. Medido el 2026-09-07: un natural sin fermentación
-- registrada no se podía etiquetar en absoluto, y un lote con dos
-- fermentaciones tendría dos etiquetas y ninguna respuesta a «¿qué proceso es
-- este lote?». Sin una sola columna por la que agrupar, el reporte por proceso
-- —intervención → tueste → puntaje— no se puede escribir.
--
-- QUÉ NO SE TOCA. `fermentation_run.process_recipe_version_id` se queda donde
-- está: una corrida puede seguir su propia receta dentro de un proceso que
-- sigue otra, y quitarlo perdería ese dato en las filas que ya existen.
--
-- LAS DOS COLUMNAS NUEVAS EN LAS CORRIDAS SON NULLABLE porque todo lo que ya
-- existe es anterior a esta tabla y no cuelga de ningún proceso. Un valor por
-- defecto habría inventado a qué proceso pertenecen.

-- CreateTable
CREATE TABLE "traceability"."lot_process" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lot_id" UUID NOT NULL,
    "sequence_order" INTEGER NOT NULL,
    "process_recipe_version_id" UUID,
    "intent" TEXT NOT NULL,
    "target_moisture_pct" DECIMAL(5,2) NOT NULL,
    "closing_moisture_measurement_id" UUID,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "notes" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "source_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "lot_process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."lot_process_intervention" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lot_process_id" UUID NOT NULL,
    "catalog_value_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "operator_person_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "lot_process_intervention_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "traceability"."fermentation_run" ADD COLUMN "lot_process_id" UUID;
ALTER TABLE "traceability"."drying_run" ADD COLUMN "lot_process_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "lot_process_lot_id_sequence_order_key" ON "traceability"."lot_process"("lot_id", "sequence_order");
CREATE INDEX "lot_process_lot_id_idx" ON "traceability"."lot_process"("lot_id");
CREATE INDEX "lot_process_process_recipe_version_id_idx" ON "traceability"."lot_process"("process_recipe_version_id");
CREATE INDEX "lot_process_closing_moisture_measurement_id_idx" ON "traceability"."lot_process"("closing_moisture_measurement_id");
CREATE INDEX "lot_process_intervention_lot_process_id_idx" ON "traceability"."lot_process_intervention"("lot_process_id");
CREATE INDEX "lot_process_intervention_catalog_value_id_idx" ON "traceability"."lot_process_intervention"("catalog_value_id");
CREATE INDEX "lot_process_intervention_occurred_at_idx" ON "traceability"."lot_process_intervention"("occurred_at");
CREATE INDEX "fermentation_run_lot_process_id_idx" ON "traceability"."fermentation_run"("lot_process_id");
CREATE INDEX "drying_run_lot_process_id_idx" ON "traceability"."drying_run"("lot_process_id");

-- AddForeignKey
ALTER TABLE "traceability"."lot_process" ADD CONSTRAINT "lot_process_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process" ADD CONSTRAINT "lot_process_process_recipe_version_id_fkey" FOREIGN KEY ("process_recipe_version_id") REFERENCES "traceability"."process_recipe_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process" ADD CONSTRAINT "lot_process_closing_moisture_measurement_id_fkey" FOREIGN KEY ("closing_moisture_measurement_id") REFERENCES "traceability"."measurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process" ADD CONSTRAINT "lot_process_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "traceability"."lot_process_intervention" ADD CONSTRAINT "lot_process_intervention_lot_process_id_fkey" FOREIGN KEY ("lot_process_id") REFERENCES "traceability"."lot_process"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process_intervention" ADD CONSTRAINT "lot_process_intervention_catalog_value_id_fkey" FOREIGN KEY ("catalog_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process_intervention" ADD CONSTRAINT "lot_process_intervention_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process_intervention" ADD CONSTRAINT "lot_process_intervention_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "traceability"."fermentation_run" ADD CONSTRAINT "fermentation_run_lot_process_id_fkey" FOREIGN KEY ("lot_process_id") REFERENCES "traceability"."lot_process"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "traceability"."drying_run" ADD CONSTRAINT "drying_run_lot_process_id_fkey" FOREIGN KEY ("lot_process_id") REFERENCES "traceability"."lot_process"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Las reglas, en la base y no en TypeScript. Una restricción que sólo vive en
-- la aplicación se la salta un importador, una reparación operativa o SQL
-- directo — y en trazabilidad eso es exactamente lo que no puede pasar.
--
-- El % H objetivo es OBLIGATORIO por decisión del dueño («no se abre un proceso
-- sin decir a qué humedad se va a almacenar»), y además tiene que ser un
-- porcentaje: un 105 o un -3 son un dedazo, y sin este CHECK se guardarían y se
-- leerían después como un objetivo real.
ALTER TABLE "traceability"."lot_process"
  ADD CONSTRAINT "lot_process_humedad_es_porcentaje" CHECK ("target_moisture_pct" > 0 AND "target_moisture_pct" <= 100);

-- Un proceso que termina antes de empezar es un dedazo de fecha, y con un
-- `datetime-local` mal tecleado es fácil.
ALTER TABLE "traceability"."lot_process"
  ADD CONSTRAINT "lot_process_termina_despues_de_empezar" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at");

-- El orden empieza en 1: un 0 o un negativo rompen la lectura de «el primer
-- proceso de este lote».
ALTER TABLE "traceability"."lot_process"
  ADD CONSTRAINT "lot_process_orden_positivo" CHECK ("sequence_order" >= 1);

-- La intención de este batch no puede ser una cadena vacía. `NOT NULL` sola
-- deja pasar `''`, que en pantalla se ve igual que «no se declaró» y hace falsa
-- la regla del dueño: «aunque no requiere receta definida, sí requiere proceso e
-- intención y detalle de este batch».
ALTER TABLE "traceability"."lot_process"
  ADD CONSTRAINT "lot_process_intencion_no_vacia" CHECK (btrim("intent") <> '');
