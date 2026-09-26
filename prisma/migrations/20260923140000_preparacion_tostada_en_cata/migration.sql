-- Una muestra verde puede tener varios tuestes. La cata debe identificar la
-- preparación exacta, no sólo el café de origen. Ambos enlaces son anulables
-- para conservar registros históricos y tuestes de producción.
ALTER TABLE "traceability"."roast_session"
  ADD COLUMN "source_sample_id" UUID;

ALTER TABLE "sensory"."sensory_blind_mapping"
  ADD COLUMN "roast_session_id" UUID;

CREATE INDEX "roast_session_source_sample_id_idx"
  ON "traceability"."roast_session"("source_sample_id");

CREATE INDEX "sensory_blind_mapping_roast_session_id_idx"
  ON "sensory"."sensory_blind_mapping"("roast_session_id");

ALTER TABLE "traceability"."roast_session"
  ADD CONSTRAINT "roast_session_source_sample_id_fkey"
  FOREIGN KEY ("source_sample_id") REFERENCES "core"."sample"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sensory"."sensory_blind_mapping"
  ADD CONSTRAINT "sensory_blind_mapping_roast_session_id_fkey"
  FOREIGN KEY ("roast_session_id") REFERENCES "traceability"."roast_session"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
