-- S1 — lote de biochar (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2,
-- semanas 1–4; Tabla 6 del marco de investigación).
--
-- Aditiva por completo: dos tipos nuevos y una tabla nueva. Ninguna tabla
-- existente cambia, así que toda fila viva sigue válida sin tocarse.
--
-- Todo nullable salvo cuatro columnas, y ninguna con default. El Paso 2 del
-- plan de acción es documentar lo que Bob YA hace, y un lote descrito de
-- memoria puede no tener temperatura de pico ni tiempo de carga. Vacío se lee
-- «sin registrar», nunca cero (ADR-080).
--
-- Lo requerido, y por qué:
--   batch_code + organization_id  el identificador que sigue al material hasta
--                                 el campo y hasta el modelo de datos; sin él
--                                 los resultados no se pueden atribuir.
--   produced_at_location_id       dónde se PRODUJO, que no es dónde se aplica.
--                                 Además es el ancla de RBAC: sin ámbito
--                                 concreto no hay autorización que resolver.
--   provenance_class              ADR-038. Un lote transcrito del cuaderno
--                                 mientras se quemaba y uno reconstruido dos
--                                 años después no son la misma afirmación.
--
-- Lo que NO está aquí, a propósito: dosis, frecuencia y parcela tratada. La
-- Tabla 6 los lista junto a lo demás porque es un formulario de papel, pero un
-- lote se quema una vez y puede aplicarse en varios bloques, a dosis distintas
-- y en fechas distintas. Viven en la aplicación de enmienda (§2, semanas
-- 10–14), pendiente de una decisión del dueño.

CREATE TYPE "traceability"."BiocharMoistureCondition" AS ENUM ('green', 'air_dried', 'dried');
CREATE TYPE "traceability"."BiocharCooling" AS ENUM ('water_quench', 'sealed_cooling', 'open_cooling');

CREATE TABLE "traceability"."biochar_batch" (
  "id"                      UUID NOT NULL DEFAULT gen_random_uuid(),
  "batch_code"              TEXT NOT NULL,
  "organization_id"         UUID NOT NULL,
  "produced_at_location_id" UUID NOT NULL,
  "produced_at"             TIMESTAMP(3),

  "feedstock"               TEXT,
  "feedstock_source"        TEXT,

  "moisture_condition"      "traceability"."BiocharMoistureCondition",
  "kiln_design"             TEXT,
  "peak_temperature_c"      INTEGER,
  "temperature_method"      TEXT,
  "burn_duration_minutes"   INTEGER,
  "time_at_peak_minutes"    INTEGER,
  "oxygen_management"       TEXT,

  "cooling"                 "traceability"."BiocharCooling",
  "quench_water_source"     TEXT,
  "particle_size"           TEXT,
  "storage_conditions"      TEXT,

  "charging_material"       TEXT,
  "charging_ratio"          TEXT,
  "co_composted"            BOOLEAN,
  "charging_duration_days"  INTEGER,

  "analysis_laboratory"     TEXT,
  "notes"                   TEXT,

  "provenance_class"        "core"."ProvenanceClass" NOT NULL,
  "source_reference"        TEXT,
  "data_quality"            "core"."DataQuality",

  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMP(3) NOT NULL,
  "created_by"              UUID,

  CONSTRAINT "biochar_batch_pkey" PRIMARY KEY ("id")
);

-- Único por organización, no globalmente: dos fincas pueden numerar desde 001.
-- Mismo razonamiento que `lot.lot_code`.
CREATE UNIQUE INDEX "biochar_batch_organization_id_batch_code_key"
  ON "traceability"."biochar_batch"("organization_id", "batch_code");
CREATE INDEX "biochar_batch_organization_id_idx"         ON "traceability"."biochar_batch"("organization_id");
CREATE INDEX "biochar_batch_produced_at_location_id_idx" ON "traceability"."biochar_batch"("produced_at_location_id");

ALTER TABLE "traceability"."biochar_batch"
  ADD CONSTRAINT "biochar_batch_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "biochar_batch_produced_at_location_id_fkey"
  FOREIGN KEY ("produced_at_location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "biochar_batch_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
