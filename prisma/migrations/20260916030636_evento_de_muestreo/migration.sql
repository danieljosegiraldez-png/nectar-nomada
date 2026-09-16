-- El acto de muestrear, sin inferir vínculos para las muestras existentes.
CREATE TABLE "core"."sampling_event" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "drying_bed_location_id" UUID,
  "drying_run_id" UUID,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "operator_person_id" UUID,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "sampling_event_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sampling_event_drying_bed_location_id_fkey" FOREIGN KEY ("drying_bed_location_id")
    REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "sampling_event_drying_run_id_fkey" FOREIGN KEY ("drying_run_id")
    REFERENCES "traceability"."drying_run"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "sampling_event_operator_person_id_fkey" FOREIGN KEY ("operator_person_id")
    REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "sampling_event_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "core"."sample"
  ADD COLUMN "sampling_event_id" UUID,
  ADD CONSTRAINT "sample_sampling_event_id_fkey" FOREIGN KEY ("sampling_event_id")
    REFERENCES "core"."sampling_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "sampling_event_drying_bed_location_id_idx" ON "core"."sampling_event"("drying_bed_location_id");
CREATE INDEX "sampling_event_drying_run_id_idx" ON "core"."sampling_event"("drying_run_id");
CREATE INDEX "sample_sampling_event_id_idx" ON "core"."sample"("sampling_event_id");

-- Misma forma que drying_run_exigir_cama: NULL pasa; un valor exige cama.
CREATE OR REPLACE FUNCTION "core"."exigir_cama_de_muestreo"()
RETURNS TRIGGER AS $$
DECLARE tipo TEXT;
BEGIN
  IF NEW."drying_bed_location_id" IS NULL THEN RETURN NEW; END IF;
  SELECT "location_type"::TEXT INTO tipo
    FROM "core"."location" WHERE "id" = NEW."drying_bed_location_id";
  IF tipo IS DISTINCT FROM 'drying_bed' THEN
    RAISE EXCEPTION 'La ubicación de un evento de muestreo debe ser una cama de secado (es %)', tipo;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "sampling_event_exigir_cama"
  BEFORE INSERT OR UPDATE OF "drying_bed_location_id" ON "core"."sampling_event"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_cama_de_muestreo"();
