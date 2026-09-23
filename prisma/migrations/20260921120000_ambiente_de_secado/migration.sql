-- Paso 4 de la spec de secado por bandeja (§4.5): la lectura de ambiente a mano.
-- Enums nuevos (CREATE TYPE, no ADD VALUE), así que se pueden usar en esta misma migración.
CREATE TYPE "core"."SkyCondition" AS ENUM ('sunny', 'partly_cloudy', 'cloudy', 'rain');
CREATE TYPE "core"."DryingVentilation" AS ENUM ('open', 'semi_open', 'closed', 'fan_or_dehumidifier');

CREATE TABLE "traceability"."drying_ambient_reading" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "facility_location_id" UUID NOT NULL,
  "rack_location_id" UUID,
  "rack_level" INTEGER,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "air_temperature_c" DECIMAL(4,1),
  "temperature_entry_unit" TEXT,
  "relative_humidity_pct" DECIMAL(4,1),
  "sky_condition" "core"."SkyCondition",
  "sky_note" TEXT,
  "ventilation" "core"."DryingVentilation",
  "ventilation_note" TEXT,
  "source_type" "traceability"."MeasurementSourceType" NOT NULL DEFAULT 'manual',
  "provenance_class" "core"."ProvenanceClass" NOT NULL,
  "operator_person_id" UUID,
  "supersedes_id" UUID,
  "superseded_at" TIMESTAMP(3),
  "correction_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "drying_ambient_reading_pkey" PRIMARY KEY ("id"),
  -- Un CHECK que da NULL PASA: cada uno descarta el nulo a propósito.
  CONSTRAINT "drying_ambient_reading_algo_medido" CHECK (
    "air_temperature_c" IS NOT NULL OR "relative_humidity_pct" IS NOT NULL
    OR "sky_condition" IS NOT NULL OR "ventilation" IS NOT NULL
  ),
  -- Los rangos de `temperature` y `relative_humidity` en lib/traceability/units.ts.
  CONSTRAINT "drying_ambient_reading_temperatura_en_rango" CHECK ("air_temperature_c" IS NULL OR "air_temperature_c" BETWEEN -10 AND 80),
  CONSTRAINT "drying_ambient_reading_hr_en_rango" CHECK ("relative_humidity_pct" IS NULL OR "relative_humidity_pct" BETWEEN 0 AND 100),
  -- 00_conventions §1: la unidad tecleada se conserva, y sólo existe si hay temperatura.
  CONSTRAINT "drying_ambient_reading_unidad_con_temperatura" CHECK (
    ("air_temperature_c" IS NULL AND "temperature_entry_unit" IS NULL)
    OR ("air_temperature_c" IS NOT NULL AND "temperature_entry_unit" IS NOT NULL AND "temperature_entry_unit" IN ('C', 'F'))
  ),
  -- La nota acompaña al catálogo, nunca lo reemplaza (spec §4.5).
  CONSTRAINT "drying_ambient_reading_nota_de_cielo_con_valor" CHECK ("sky_note" IS NULL OR "sky_condition" IS NOT NULL),
  CONSTRAINT "drying_ambient_reading_nota_de_ventilacion_con_valor" CHECK ("ventilation_note" IS NULL OR "ventilation" IS NOT NULL),
  CONSTRAINT "drying_ambient_reading_nivel_positivo" CHECK ("rack_level" IS NULL OR "rack_level" > 0),
  CONSTRAINT "drying_ambient_reading_procedencia" CHECK ("provenance_class" IN ('measured_fact', 'direct_observation')),
  CONSTRAINT "drying_ambient_reading_correccion_con_razon" CHECK (
    "supersedes_id" IS NULL OR ("correction_reason" IS NOT NULL AND char_length(trim("correction_reason")) > 0)
  )
);
ALTER TABLE "traceability"."drying_ambient_reading"
  ADD CONSTRAINT "drying_ambient_reading_facility_location_id_fkey" FOREIGN KEY ("facility_location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_ambient_reading_rack_location_id_fkey" FOREIGN KEY ("rack_location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_ambient_reading_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_ambient_reading_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "traceability"."drying_ambient_reading"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_ambient_reading_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "drying_ambient_reading_facility_location_id_occurred_at_idx" ON "traceability"."drying_ambient_reading"("facility_location_id", "occurred_at");
CREATE UNIQUE INDEX "drying_ambient_reading_supersedes_unico"
  ON "traceability"."drying_ambient_reading"("supersedes_id") WHERE "supersedes_id" IS NOT NULL;

-- El punto: instalación de secado; estante de ESA instalación; nivel que exista.
-- Mira otras filas, así que va por disparador. FOR SHARE: el padre no cambia
-- de tipo ni de sitio mientras se inserta (misma razón que el pesaje, A8 del 2a).
CREATE OR REPLACE FUNCTION "traceability"."exigir_punto_de_ambiente"()
RETURNS TRIGGER AS $$
DECLARE tipo TEXT; padre UUID; instalacion_original UUID;
BEGIN
  SELECT "location_type" INTO tipo FROM "core"."location" WHERE "id" = NEW."facility_location_id" FOR SHARE;
  IF tipo IS DISTINCT FROM 'drying_facility' THEN
    RAISE EXCEPTION 'El lugar de una lectura de ambiente no es una instalacion de secado';
  END IF;
  IF NEW."rack_location_id" IS NOT NULL THEN
    SELECT "location_type", "parent_location_id" INTO tipo, padre FROM "core"."location" WHERE "id" = NEW."rack_location_id" FOR SHARE;
    IF tipo IS DISTINCT FROM 'drying_rack' OR padre IS DISTINCT FROM NEW."facility_location_id" THEN
      RAISE EXCEPTION 'El estante de la lectura no es un estante de esta instalacion';
    END IF;
  END IF;
  -- `> 0`: un BEFORE INSERT corre ANTES que los CHECK. Sin esta guarda, un nivel 0
  -- saldría como «ese nivel no existe» y la sonda del CHECK de nivel positivo
  -- nunca vería su propia regla.
  IF NEW."rack_level" IS NOT NULL AND NEW."rack_level" > 0 THEN
    -- Con estante: una posición de ese estante con ese nivel. Sin estante: una
    -- cama de la instalación, o una posición de cualquiera de sus estantes.
    IF NOT EXISTS (
      SELECT 1 FROM "core"."location" c
      LEFT JOIN "core"."location" e ON e."id" = c."parent_location_id"
      WHERE c."location_type" = 'drying_bed' AND c."rack_level" = NEW."rack_level"
        AND (
          (NEW."rack_location_id" IS NOT NULL AND c."parent_location_id" = NEW."rack_location_id")
          OR (NEW."rack_location_id" IS NULL AND (
                c."parent_location_id" = NEW."facility_location_id"
             OR (e."location_type" = 'drying_rack' AND e."parent_location_id" = NEW."facility_location_id")))
        )
    ) THEN
      RAISE EXCEPTION 'La lectura nombra un nivel, y ese nivel no existe en ese punto';
    END IF;
  END IF;
  IF NEW."supersedes_id" IS NOT NULL THEN
    SELECT "facility_location_id" INTO instalacion_original FROM "traceability"."drying_ambient_reading" WHERE "id" = NEW."supersedes_id" FOR SHARE;
    IF instalacion_original IS DISTINCT FROM NEW."facility_location_id" THEN
      RAISE EXCEPTION 'La correccion debe ser de la misma instalacion que la lectura original';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "drying_ambient_reading_punto"
  BEFORE INSERT ON "traceability"."drying_ambient_reading"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_punto_de_ambiente"();

-- Inmutable salvo marcarla superseded UNA vez (00_conventions §4).
CREATE OR REPLACE FUNCTION "traceability"."lectura_de_ambiente_inmutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."superseded_at" IS NULL AND NEW."superseded_at" IS NOT NULL
     AND (to_jsonb(NEW) - 'superseded_at') = (to_jsonb(OLD) - 'superseded_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Una lectura de ambiente no se edita: se corrige con otra que la supersede';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "drying_ambient_reading_inmutable"
  BEFORE UPDATE ON "traceability"."drying_ambient_reading"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."lectura_de_ambiente_inmutable"();

-- Tampoco se borra. La misma puerta de dos llaves que el pesaje de bandeja:
-- ajuste de sesión Y base de pruebas por su nombre.
CREATE OR REPLACE FUNCTION "traceability"."lectura_de_ambiente_no_se_borra"()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('nn.limpieza_de_pruebas', true) = 'on'
     AND current_database() ~ '^(nectar_test|nectar_ci|nn_flip_)' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Una lectura de ambiente no se borra: se corrige con otra que la supersede';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "drying_ambient_reading_no_se_borra"
  BEFORE DELETE ON "traceability"."drying_ambient_reading"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."lectura_de_ambiente_no_se_borra"();

-- Del lado del padre: una instalación o un estante con lecturas no cambia de
-- tipo ni de padre — la lectura diría que se tomó en otro sitio.
CREATE OR REPLACE FUNCTION "core"."exigir_lugar_con_ambiente_quieto"()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW."location_type" IS DISTINCT FROM OLD."location_type" OR NEW."parent_location_id" IS DISTINCT FROM OLD."parent_location_id")
     AND EXISTS (
       SELECT 1 FROM "traceability"."drying_ambient_reading"
       WHERE "facility_location_id" = NEW."id" OR "rack_location_id" = NEW."id"
     ) THEN
    RAISE EXCEPTION 'Este lugar tiene lecturas de ambiente: no cambia de tipo ni de padre';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "location_con_ambiente_quieto"
  BEFORE UPDATE OF "location_type", "parent_location_id" ON "core"."location"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_lugar_con_ambiente_quieto"();
