-- P4 §11 extendido para la ronda de trampas (spec de vistas de finca y parcela §4.3):
-- la revisión necesita una clave de idempotencia igual que PlantingCohort, SoilSample,
-- etc., para viajar por la cola sin señal y para que su foto (Tarea 12) pueda
-- engancharse a una revisión que el servidor todavía no ha visto.
--
-- Mismo patrón que 20260916041300_client_draft_id_en_captura_de_parcela: anulable y
-- UNIQUE. Anulable porque solo las revisiones que pasan por la cola offline la llevan;
-- las que entran desde la web (con señal) no compiten entre sí, y Postgres permite
-- tantos NULL como haga falta en una columna UNIQUE.
--
-- Todo aditivo. Ninguna fila existente cambia.

ALTER TABLE "traceability"."specimen_observation" ADD COLUMN "client_draft_id" TEXT;

CREATE UNIQUE INDEX "specimen_observation_client_draft_id_key"
  ON "traceability"."specimen_observation"("client_draft_id");
