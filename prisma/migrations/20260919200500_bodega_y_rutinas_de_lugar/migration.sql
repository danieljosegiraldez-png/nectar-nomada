-- Spec 2026-09-19 §4.1 y §4.3.

-- ── La bodega cuelga de un beneficio o de una finca ──
-- En la base y no sólo en el servicio: un importador o SQL directo no pasan por
-- TypeScript.
CREATE FUNCTION "core"."location_bodega_padre"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tipo_padre text;
BEGIN
  IF NEW."location_type"::text <> 'storage_facility' THEN
    RETURN NEW;
  END IF;
  IF NEW."parent_location_id" IS NULL THEN
    RAISE EXCEPTION 'bodega_padre_invalido' USING ERRCODE = 'check_violation';
  END IF;
  SELECT "location_type"::text INTO tipo_padre FROM "core"."location" WHERE "id" = NEW."parent_location_id";
  IF tipo_padre IS NULL OR tipo_padre NOT IN ('beneficio', 'site') THEN
    RAISE EXCEPTION 'bodega_padre_invalido' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "location_bodega_padre"
  BEFORE INSERT OR UPDATE OF "location_type", "parent_location_id" ON "core"."location"
  FOR EACH ROW EXECUTE FUNCTION "core"."location_bodega_padre"();

-- ── El insumo de cada vez que se hizo una rutina ──
ALTER TABLE "traceability"."material_consumption_entry" ADD COLUMN "care_routine_event_id" UUID;
ALTER TABLE "traceability"."material_consumption_entry" ADD CONSTRAINT "material_consumption_entry_care_routine_event_id_fkey"
  FOREIGN KEY ("care_routine_event_id") REFERENCES "core"."care_routine_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "material_consumption_entry_care_routine_event_id_idx"
  ON "traceability"."material_consumption_entry"("care_routine_event_id");

-- «Un consumo tiene UN padre, no dos» (migración 20260917180000) vivía sólo en
-- prosa. Medido antes de escribirlo: 0 filas con más de uno (plan, Task 1 Step 1).
ALTER TABLE "traceability"."material_consumption_entry" ADD CONSTRAINT "material_consumption_entry_un_padre"
  CHECK (num_nonnulls("fermentation_run_id", "drying_run_id", "location_id", "field_session_id", "care_routine_event_id") <= 1);
