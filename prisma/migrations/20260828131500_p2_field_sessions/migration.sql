-- P2 §3–§5 — field sessions, the field-event spine, and honest timestamps
-- (docs/implementation/43_P2_OPERATOR_CORE.md).
--
-- Entirely additive. Two new tables and nullable columns only; every existing
-- row stays valid untouched.

-- ---------------------------------------------------------------------------
-- 1. field_session — the envelope for one visit.
--
--    operator_person_id is a Person, not a UserAccount, deliberately: most
--    Person rows here have no email and therefore no account, and a session
--    recorded by someone who cannot log in is the normal case.
--
--    task_id is nullable — somebody walking a block because they noticed
--    something is a real session, and requiring a task first would push it
--    back into memory.
-- ---------------------------------------------------------------------------
CREATE TABLE "traceability"."field_session" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "location_id"        UUID NOT NULL,
  "operator_person_id" UUID NOT NULL,
  "task_id"            UUID,
  "started_at"         TIMESTAMP(3) NOT NULL,
  "ended_at"           TIMESTAMP(3),
  -- Nullable: a device with no fix, or a session written up at a desk
  -- afterwards, genuinely has no coordinates. A fabricated one is worse.
  "start_latitude"     DOUBLE PRECISION,
  "start_longitude"    DOUBLE PRECISION,
  "start_accuracy_m"   DOUBLE PRECISION,
  "notes"              TEXT,
  "provenance_class"   "core"."ProvenanceClass" NOT NULL,
  "data_quality"       "core"."DataQuality",
  "recorded_at"        TIMESTAMP(3),
  "synced_at"          TIMESTAMP(3),
  "device_id"          UUID,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"         UUID,

  CONSTRAINT "field_session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "field_session_location_id_idx"        ON "traceability"."field_session"("location_id");
CREATE INDEX "field_session_operator_person_id_idx" ON "traceability"."field_session"("operator_person_id");
CREATE INDEX "field_session_task_id_idx"            ON "traceability"."field_session"("task_id");
CREATE INDEX "field_session_started_at_idx"         ON "traceability"."field_session"("started_at");

ALTER TABLE "traceability"."field_session"
  ADD CONSTRAINT "field_session_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "field_session_operator_person_id_fkey"
    FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "field_session_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "partner"."task"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "field_session_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. field_event — a chronological spine, not a replacement.
--
--    This table owns no domain semantics. It records when, where and by whom
--    something happened during a session, and points at the row holding *what*
--    through a nullable FK per parent — the ADR-020 decision 8 pattern `asset`
--    already uses fifteen times. Absorbing fermentation_intervention,
--    drying_turn_event, specimen_observation and friends into one generic
--    table would degrade their typed columns into JSON, which CLAUDE.md §49
--    forbids outright.
-- ---------------------------------------------------------------------------
CREATE TABLE "traceability"."field_event" (
  "id"                      UUID NOT NULL DEFAULT gen_random_uuid(),
  "field_session_id"        UUID NOT NULL,
  -- A catalog value, not an enum: what an operator might record keeps growing,
  -- and P1 established that a growing vocabulary is a seed entry.
  "event_kind_value_id"     UUID NOT NULL,
  "occurred_at"             TIMESTAMP(3) NOT NULL,
  "latitude"                DOUBLE PRECISION,
  "longitude"               DOUBLE PRECISION,
  "accuracy_m"              DOUBLE PRECISION,
  "operator_person_id"      UUID,
  "notes"                   TEXT,
  "measurement_id"          UUID,
  "quantity_event_id"       UUID,
  "specimen_observation_id" UUID,
  "asset_id"                UUID,
  "harvest_event_id"        UUID,
  "lot_transformation_id"   UUID,
  "provenance_class"        "core"."ProvenanceClass" NOT NULL,
  "recorded_at"             TIMESTAMP(3),
  "synced_at"               TIMESTAMP(3),
  "device_id"               UUID,
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"              UUID,

  CONSTRAINT "field_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "field_event_field_session_id_idx"    ON "traceability"."field_event"("field_session_id");
CREATE INDEX "field_event_occurred_at_idx"         ON "traceability"."field_event"("occurred_at");
CREATE INDEX "field_event_event_kind_value_id_idx" ON "traceability"."field_event"("event_kind_value_id");
CREATE INDEX "field_event_measurement_id_idx"      ON "traceability"."field_event"("measurement_id");
CREATE INDEX "field_event_asset_id_idx"            ON "traceability"."field_event"("asset_id");

ALTER TABLE "traceability"."field_event"
  ADD CONSTRAINT "field_event_field_session_id_fkey"
    FOREIGN KEY ("field_session_id") REFERENCES "traceability"."field_session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "field_event_event_kind_value_id_fkey"
    FOREIGN KEY ("event_kind_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "field_event_operator_person_id_fkey"
    FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "field_event_measurement_id_fkey"
    FOREIGN KEY ("measurement_id") REFERENCES "traceability"."measurement"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "field_event_quantity_event_id_fkey"
    FOREIGN KEY ("quantity_event_id") REFERENCES "traceability"."quantity_event"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "field_event_specimen_observation_id_fkey"
    FOREIGN KEY ("specimen_observation_id") REFERENCES "traceability"."specimen_observation"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "field_event_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "core"."asset"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "field_event_harvest_event_id_fkey"
    FOREIGN KEY ("harvest_event_id") REFERENCES "traceability"."harvest_event"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "field_event_lot_transformation_id_fkey"
    FOREIGN KEY ("lot_transformation_id") REFERENCES "traceability"."lot_transformation"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "field_event_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Time integrity on the tables that capture in the moment.
--
--    Three facts the schema could previously hold only one of: measured at
--    14:00, entered on the phone at 14:23, synced the next morning at 09:17.
--
--    Scoped to measurement, quantity_event and the two apiary tables that
--    already have an offline write path (client_draft_id, A5) — the only
--    places where device-vs-server time diverges today rather than in theory.
--    The remaining capture tables get these in Phase 4 alongside `device`,
--    when the FK can actually be wired and something writes them.
--
--    measurement.device_id already exists as free text from T3 and nothing has
--    ever written it. Left alone rather than repurposed: a column that meant
--    "some string a lab machine reported" and now meant "a registered device"
--    would make old rows lie. capture_device_id is the real one.
-- ---------------------------------------------------------------------------
ALTER TABLE "traceability"."measurement"
  ADD COLUMN "recorded_at"       TIMESTAMP(3),
  ADD COLUMN "synced_at"         TIMESTAMP(3),
  ADD COLUMN "capture_device_id" UUID;

ALTER TABLE "traceability"."quantity_event"
  ADD COLUMN "recorded_at"       TIMESTAMP(3),
  ADD COLUMN "synced_at"         TIMESTAMP(3),
  ADD COLUMN "capture_device_id" UUID;

ALTER TABLE "apiary"."inspection"
  ADD COLUMN "recorded_at"       TIMESTAMP(3),
  ADD COLUMN "synced_at"         TIMESTAMP(3),
  ADD COLUMN "capture_device_id" UUID;

ALTER TABLE "apiary"."colony_event"
  ADD COLUMN "recorded_at"       TIMESTAMP(3),
  ADD COLUMN "synced_at"         TIMESTAMP(3),
  ADD COLUMN "capture_device_id" UUID;
