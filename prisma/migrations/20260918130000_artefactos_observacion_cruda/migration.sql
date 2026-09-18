-- Artefactos de colmena, Tarea 5: la observación cruda del nodo, inmutable e idempotente.
-- Spec: docs/superpowers/specs/2026-09-17-artefactos-de-colmena-design.md §B.3.

-- La identidad de ruta del nodo.
ALTER TABLE "apiary"."hive_node" ADD COLUMN "notecard_uid" TEXT;
CREATE UNIQUE INDEX "hive_node_notecard_uid_key" ON "apiary"."hive_node"("notecard_uid");

-- CreateTable
CREATE TABLE "apiary"."node_observation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" TEXT NOT NULL,
    "epoch" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "event_id" TEXT NOT NULL,
    "hive_node_id" UUID NOT NULL,
    "observed_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "time_quality" TEXT NOT NULL,
    "hive_id" UUID,
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "faults" JSONB NOT NULL,
    "missed_samples" INTEGER NOT NULL,

    CONSTRAINT "node_observation_pkey" PRIMARY KEY ("id"),
    -- Una hora «unknown» no se convierte en una hora: la regla literal del paquete.
    CONSTRAINT "node_observation_sin_hora_si_desconocida" CHECK ("time_quality" <> 'unknown' OR "observed_at" IS NULL),
    CONSTRAINT "node_observation_seq_no_negativa" CHECK ("seq" >= 0 AND "missed_samples" >= 0)
);

CREATE TABLE "apiary"."node_observation_conflict" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" TEXT NOT NULL,
    "epoch" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "existing_observation_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_observation_conflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "node_observation_device_id_epoch_seq_key" ON "apiary"."node_observation"("device_id", "epoch", "seq");
CREATE INDEX "node_observation_hive_id_observed_at_idx" ON "apiary"."node_observation"("hive_id", "observed_at");
CREATE INDEX "node_observation_hive_node_id_received_at_idx" ON "apiary"."node_observation"("hive_node_id", "received_at");
CREATE INDEX "node_observation_conflict_device_id_epoch_seq_idx" ON "apiary"."node_observation_conflict"("device_id", "epoch", "seq");

-- AddForeignKey
ALTER TABLE "apiary"."node_observation" ADD CONSTRAINT "node_observation_hive_node_id_fkey" FOREIGN KEY ("hive_node_id") REFERENCES "apiary"."hive_node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apiary"."node_observation" ADD CONSTRAINT "node_observation_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "apiary"."hive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apiary"."node_observation_conflict" ADD CONSTRAINT "node_observation_conflict_existing_observation_id_fkey" FOREIGN KEY ("existing_observation_id") REFERENCES "apiary"."node_observation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El crudo es INMUTABLE: ninguna actualización, venga de donde venga. Recalibrar produce una
-- lectura derivada nueva. (El borrado queda abierto para retiradas operativas explícitas.)
CREATE FUNCTION "apiary"."node_observation_inmutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'node_observation es inmutable: se deriva una lectura nueva, no se reescribe el crudo';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "node_observation_inmutable"
  BEFORE UPDATE ON "apiary"."node_observation"
  FOR EACH ROW EXECUTE FUNCTION "apiary"."node_observation_inmutable"();
