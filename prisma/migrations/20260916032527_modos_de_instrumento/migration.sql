-- Modos declarados por instrumento; ninguna lectura histórica recibe un modo inferido.
CREATE TYPE "core"."MeasurementReviewReason" AS ENUM (
  'instrument_check_failed', 'instrument_check_overdue',
  'mode_material_mismatch', 'material_stage_mismatch'
);

CREATE TABLE "core"."instrument_measurement_mode" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "equipment_id" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "material_state" "core"."MaterialState" NOT NULL,
  "range_min" DECIMAL(12,4),
  "range_max" DECIMAL(12,4),
  "calibration_offset" DECIMAL(5,2),
  "calibration_mode" TEXT,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "retired_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "instrument_measurement_mode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "instrument_measurement_mode_equipment_id_label_key"
  ON "core"."instrument_measurement_mode"("equipment_id", "label");
CREATE INDEX "instrument_measurement_mode_equipment_id_idx"
  ON "core"."instrument_measurement_mode"("equipment_id");
ALTER TABLE "core"."instrument_measurement_mode"
  ADD CONSTRAINT "instrument_measurement_mode_equipment_id_fkey"
  FOREIGN KEY ("equipment_id") REFERENCES "core"."equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "traceability"."measurement" ADD COLUMN "instrument_mode_id" UUID;
ALTER TABLE "traceability"."measurement"
  ADD CONSTRAINT "measurement_instrument_mode_id_fkey"
  FOREIGN KEY ("instrument_mode_id") REFERENCES "core"."instrument_measurement_mode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "core"."measurement_review_flag"
  ALTER COLUMN "raised_by_check_id" DROP NOT NULL,
  ADD COLUMN "reason" "core"."MeasurementReviewReason" NOT NULL DEFAULT 'instrument_check_failed';

-- Una marca de instrumento SIN su check no dice de dónde salió.
ALTER TABLE "core"."measurement_review_flag"
  ADD CONSTRAINT "review_flag_causa_coherente"
    CHECK (
      ("reason" IN ('instrument_check_failed','instrument_check_overdue') AND "raised_by_check_id" IS NOT NULL)
      OR ("reason" IN ('mode_material_mismatch','material_stage_mismatch') AND "raised_by_check_id" IS NULL)
    );

CREATE UNIQUE INDEX "review_flag_una_por_motivo_sin_check"
  ON "core"."measurement_review_flag"("measurement_id","reason")
  WHERE "raised_by_check_id" IS NULL;
