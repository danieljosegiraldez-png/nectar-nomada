-- Parte 1 (2026-09-30): el proceso cubre al lote.
-- docs/superpowers/specs/2026-09-30-parte-1-el-proceso-cubre-al-lote-design.md, §3.1.
--
-- Primero se CUENTA, y si los datos no permiten las restricciones nuevas se aborta: decidir qué
-- proceso sigue abierto, o con qué humedad se cerró uno, es una decisión humana que esta migración
-- no puede inventar. Es el patrón de 20260908070000_grado_y_cereza_obligatorios.
DO $$
DECLARE dobles INTEGER; cerrados_sin_medicion INTEGER; abiertos_con_medicion INTEGER;
BEGIN
  SELECT count(*) INTO dobles FROM (
    SELECT "lot_id" FROM "traceability"."lot_process" WHERE "ended_at" IS NULL GROUP BY "lot_id" HAVING count(*) > 1
  ) d;
  IF dobles > 0 THEN
    RAISE EXCEPTION 'lot_process: % lote(s) con más de un proceso abierto. Elegir cuál sigue abierto es una decisión humana.', dobles;
  END IF;
  SELECT count(*) INTO cerrados_sin_medicion FROM "traceability"."lot_process"
  WHERE "ended_at" IS NOT NULL AND "closing_moisture_measurement_id" IS NULL;
  IF cerrados_sin_medicion > 0 THEN
    RAISE EXCEPTION 'lot_process: % proceso(s) cerrados sin medición de cierre: no se puede decidir aquí cómo se cerraron.', cerrados_sin_medicion;
  END IF;
  SELECT count(*) INTO abiertos_con_medicion FROM "traceability"."lot_process"
  WHERE "ended_at" IS NULL AND "closing_moisture_measurement_id" IS NOT NULL;
  IF abiertos_con_medicion > 0 THEN
    RAISE EXCEPTION 'lot_process: % proceso(s) abiertos con medición de cierre: estado incoherente, revisarlo a mano.', abiertos_con_medicion;
  END IF;
END $$;

CREATE TYPE "traceability"."LotProcessClosure" AS ENUM ('moisture', 'divided');

ALTER TABLE "traceability"."lot_process"
  ADD COLUMN "closure_kind" "traceability"."LotProcessClosure",
  ADD COLUMN "divided_by_transformation_id" UUID,
  ADD COLUMN "derived_from_lot_process_id" UUID;

-- Todo cierre de hoy pasó por cerrarProceso, que exige la medición: son cierres por humedad.
UPDATE "traceability"."lot_process" SET "closure_kind" = 'moisture' WHERE "ended_at" IS NOT NULL;

ALTER TABLE "traceability"."lot_process"
  ADD CONSTRAINT "lot_process_cierre_sii_tipo" CHECK (("ended_at" IS NULL) = ("closure_kind" IS NULL));
ALTER TABLE "traceability"."lot_process"
  ADD CONSTRAINT "lot_process_cierre_por_humedad_lleva_medicion"
  CHECK ("closure_kind" IS DISTINCT FROM 'moisture' OR "closing_moisture_measurement_id" IS NOT NULL);
ALTER TABLE "traceability"."lot_process"
  ADD CONSTRAINT "lot_process_division_sin_medicion_y_con_transformacion"
  CHECK ("closure_kind" IS DISTINCT FROM 'divided' OR ("closing_moisture_measurement_id" IS NULL AND "divided_by_transformation_id" IS NOT NULL));
ALTER TABLE "traceability"."lot_process"
  ADD CONSTRAINT "lot_process_medicion_solo_si_por_humedad"
  CHECK ("closing_moisture_measurement_id" IS NULL OR "closure_kind" = 'moisture');
ALTER TABLE "traceability"."lot_process"
  ADD CONSTRAINT "lot_process_transformacion_solo_si_dividido"
  CHECK ("divided_by_transformation_id" IS NULL OR "closure_kind" = 'divided');

ALTER TABLE "traceability"."lot_process" ADD CONSTRAINT "lot_process_divided_by_transformation_id_fkey"
  FOREIGN KEY ("divided_by_transformation_id") REFERENCES "traceability"."lot_transformation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process" ADD CONSTRAINT "lot_process_derived_from_lot_process_id_fkey"
  FOREIGN KEY ("derived_from_lot_process_id") REFERENCES "traceability"."lot_process"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
CREATE INDEX "lot_process_divided_by_transformation_id_idx" ON "traceability"."lot_process"("divided_by_transformation_id");
CREATE INDEX "lot_process_derived_from_lot_process_id_idx" ON "traceability"."lot_process"("derived_from_lot_process_id");

-- R2: un solo proceso abierto por lote. Entre lotes del mismo linaje lo sostiene el servicio
-- (bloquearLinaje); aquí se cierra el caso del mismo lote. Va en SQL y no en el esquema, como los
-- índices parciales de `reinas` y `ruedas_sensoriales`.
CREATE UNIQUE INDEX "lot_process_un_abierto_por_lote" ON "traceability"."lot_process"("lot_id") WHERE "ended_at" IS NULL;

CREATE TABLE "traceability"."lot_process_return" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "closed_lot_process_id" UUID NOT NULL,
    "continuation_lot_process_id" UUID NOT NULL,
    "reason_value_id" UUID NOT NULL,
    "note" TEXT,
    "ended_storage_assignment_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "lot_process_return_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lot_process_return_continuation_lot_process_id_key" ON "traceability"."lot_process_return"("continuation_lot_process_id");
CREATE INDEX "lot_process_return_closed_lot_process_id_idx" ON "traceability"."lot_process_return"("closed_lot_process_id");
CREATE INDEX "lot_process_return_reason_value_id_idx" ON "traceability"."lot_process_return"("reason_value_id");
CREATE INDEX "lot_process_return_ended_storage_assignment_id_idx" ON "traceability"."lot_process_return"("ended_storage_assignment_id");
ALTER TABLE "traceability"."lot_process_return" ADD CONSTRAINT "lot_process_return_closed_lot_process_id_fkey"
  FOREIGN KEY ("closed_lot_process_id") REFERENCES "traceability"."lot_process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process_return" ADD CONSTRAINT "lot_process_return_continuation_lot_process_id_fkey"
  FOREIGN KEY ("continuation_lot_process_id") REFERENCES "traceability"."lot_process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process_return" ADD CONSTRAINT "lot_process_return_reason_value_id_fkey"
  FOREIGN KEY ("reason_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process_return" ADD CONSTRAINT "lot_process_return_ended_storage_assignment_id_fkey"
  FOREIGN KEY ("ended_storage_assignment_id") REFERENCES "traceability"."storage_assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process_return" ADD CONSTRAINT "lot_process_return_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
