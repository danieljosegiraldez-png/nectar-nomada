-- Cola offline para captura de parcela — Tarea 1: la columna que impide el
-- duplicado. Ver
-- `.superpowers/sdd/2026-09-16-cola-offline-captura-de-parcela/task-1-brief.md`.
--
-- Mismo patrón que `traceability.field_event.client_draft_id`
-- (20260904190000_p4_device_y_client_draft_id): anulable y UNIQUE. Anulable
-- porque solo las escrituras que pasan por la cola offline la llevan; las que
-- entran desde la web no compiten entre sí, y Postgres permite tantos NULL
-- como haga falta en una columna UNIQUE.
--
-- Todo aditivo. Ninguna fila existente cambia.

ALTER TABLE "traceability"."soil_sample" ADD COLUMN "client_draft_id" TEXT;

CREATE UNIQUE INDEX "soil_sample_client_draft_id_key"
  ON "traceability"."soil_sample"("client_draft_id");

ALTER TABLE "traceability"."foliar_sample" ADD COLUMN "client_draft_id" TEXT;

CREATE UNIQUE INDEX "foliar_sample_client_draft_id_key"
  ON "traceability"."foliar_sample"("client_draft_id");

ALTER TABLE "traceability"."soil_profile" ADD COLUMN "client_draft_id" TEXT;

CREATE UNIQUE INDEX "soil_profile_client_draft_id_key"
  ON "traceability"."soil_profile"("client_draft_id");

ALTER TABLE "traceability"."planting_cohort" ADD COLUMN "client_draft_id" TEXT;

CREATE UNIQUE INDEX "planting_cohort_client_draft_id_key"
  ON "traceability"."planting_cohort"("client_draft_id");
