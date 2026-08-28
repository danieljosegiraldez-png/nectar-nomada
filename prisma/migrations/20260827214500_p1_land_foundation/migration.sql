-- P1 — land foundation (docs/implementation/42_P1_LAND_FOUNDATION.md §1, §3, §5).
--
-- Entirely additive: two new tables, three nullable columns, no backfill, no
-- nullable→required change, nothing destructive. Every existing row stays
-- valid untouched — which matters here more than usual, because the land side
-- holds almost no data yet (8 plots, 1 planting event, 0 specimens) and the
-- one pre-existing PlantingEvent predates cohorts entirely.

-- ---------------------------------------------------------------------------
-- 1. Location gains an area.
--
--    F1 added sun exposure, shade bracket, altitude range, slope, soil and
--    plant spacing but no area, so planted area, yield per hectare and
--    cultivar distribution by area could not be computed at all. Deliberately
--    not derived from a boundary polygon: none exists, and a producer knows
--    their block's hectares long before anyone walks its perimeter with GPS.
-- ---------------------------------------------------------------------------
ALTER TABLE "core"."location"
  ADD COLUMN "area_hectares" DECIMAL(10,4);

-- ---------------------------------------------------------------------------
-- 2. PlantingCohort — the standing population in a block.
--
--    Renovation is a NEW cohort, never an edit: a stumped and replanted block
--    leaves the previous cohort `removed` with a removed_at, and what stood
--    there stays true.
-- ---------------------------------------------------------------------------
CREATE TYPE "traceability"."PlantingCohortStatus" AS ENUM ('active', 'removed', 'renovated');

CREATE TABLE "traceability"."planting_cohort" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "location_id"         UUID NOT NULL,
  -- Nullable and must stay so: a block whose cultivar nobody is sure of is an
  -- ordinary situation, and `desconocido` recorded honestly beats a guess
  -- promoted to a fact.
  "cultivar_value_id"   UUID,
  "planted_at"          TIMESTAMP(3),
  -- Reuses S1's HarvestWindowPrecision rather than inventing a second
  -- precision vocabulary. "Sembrado en 2019" and "sembrado el 14 de marzo de
  -- 2019" are different claims and a producer usually knows only the first.
  "planted_precision"   "core"."HarvestWindowPrecision",
  "plant_count"         INTEGER,
  "density_per_hectare" DECIMAL(10,2),
  "spacing_meters"      DECIMAL(5,2),
  "status"              "traceability"."PlantingCohortStatus" NOT NULL DEFAULT 'active',
  "removed_at"          TIMESTAMP(3),
  "notes"               TEXT,
  "provenance_class"    "core"."ProvenanceClass" NOT NULL,
  "data_quality"        "core"."DataQuality",
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  "created_by"          UUID,

  CONSTRAINT "planting_cohort_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "planting_cohort_location_id_idx"       ON "traceability"."planting_cohort"("location_id");
CREATE INDEX "planting_cohort_cultivar_value_id_idx" ON "traceability"."planting_cohort"("cultivar_value_id");

ALTER TABLE "traceability"."planting_cohort"
  ADD CONSTRAINT "planting_cohort_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "planting_cohort_cultivar_value_id_fkey"
  FOREIGN KEY ("cultivar_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "planting_cohort_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Existing land records may point at a cohort. Both nullable: the one
--    pre-existing PlantingEvent predates cohorts, and a broca trap belongs to
--    no cohort at all.
-- ---------------------------------------------------------------------------
ALTER TABLE "traceability"."planting_event"
  ADD COLUMN "planting_cohort_id" UUID;
ALTER TABLE "traceability"."specimen"
  ADD COLUMN "planting_cohort_id" UUID;

CREATE INDEX "planting_event_planting_cohort_id_idx" ON "traceability"."planting_event"("planting_cohort_id");
CREATE INDEX "specimen_planting_cohort_id_idx"       ON "traceability"."specimen"("planting_cohort_id");

ALTER TABLE "traceability"."planting_event"
  ADD CONSTRAINT "planting_event_planting_cohort_id_fkey"
  FOREIGN KEY ("planting_cohort_id") REFERENCES "traceability"."planting_cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "traceability"."specimen"
  ADD CONSTRAINT "specimen_planting_cohort_id_fkey"
  FOREIGN KEY ("planting_cohort_id") REFERENCES "traceability"."planting_cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. HarvestEventSource — a harvest drawing from several blocks.
--
--    harvest_event.location_id deliberately stays NOT NULL and unchanged: it
--    is the primary plot, the one a single-block harvest names, and V1's own
--    test asserts it is structurally required. These rows are *additional*
--    contributions, so every existing harvest stays valid with none.
-- ---------------------------------------------------------------------------
CREATE TABLE "traceability"."harvest_event_source" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "harvest_event_id"   UUID NOT NULL,
  "location_id"        UUID NOT NULL,
  "planting_cohort_id" UUID,
  "cherry_weight_kg"   DECIMAL(10,3),
  "notes"              TEXT,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"         UUID,

  CONSTRAINT "harvest_event_source_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "harvest_event_source_harvest_event_id_location_id_planting_key"
  ON "traceability"."harvest_event_source"("harvest_event_id", "location_id", "planting_cohort_id");
CREATE INDEX "harvest_event_source_harvest_event_id_idx"   ON "traceability"."harvest_event_source"("harvest_event_id");
CREATE INDEX "harvest_event_source_location_id_idx"        ON "traceability"."harvest_event_source"("location_id");
CREATE INDEX "harvest_event_source_planting_cohort_id_idx" ON "traceability"."harvest_event_source"("planting_cohort_id");

ALTER TABLE "traceability"."harvest_event_source"
  ADD CONSTRAINT "harvest_event_source_harvest_event_id_fkey"
  FOREIGN KEY ("harvest_event_id") REFERENCES "traceability"."harvest_event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "harvest_event_source_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "harvest_event_source_planting_cohort_id_fkey"
  FOREIGN KEY ("planting_cohort_id") REFERENCES "traceability"."planting_cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "harvest_event_source_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
