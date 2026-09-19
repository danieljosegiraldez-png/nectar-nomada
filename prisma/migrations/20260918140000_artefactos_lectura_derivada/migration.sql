-- Artefactos de colmena, Tarea 6: calibraciones y lecturas derivadas del nodo.
-- La fórmula es la del firmware del paquete: counts = offset + counts_per_kg × kg.

CREATE TABLE "apiary"."node_calibration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_node_id" UUID NOT NULL,
    "calibration_id" TEXT NOT NULL,
    "offset" DOUBLE PRECISION NOT NULL,
    "counts_per_kg" DOUBLE PRECISION NOT NULL,
    "residual_kg" DOUBLE PRECISION,
    "location_id" UUID NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "node_calibration_pkey" PRIMARY KEY ("id"),
    -- La misma regla que el firmware (CAL_INVALID): una escala menor que 1 cuenta/kg no es escala.
    CONSTRAINT "node_calibration_escala_valida" CHECK (abs("counts_per_kg") >= 1)
);

CREATE TABLE "apiary"."node_derived_reading" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "observation_id" UUID NOT NULL,
    "variable" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "algorithm_version" INTEGER NOT NULL,
    "calibration_id" UUID NOT NULL,
    "limitations" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "node_derived_reading_pkey" PRIMARY KEY ("id"),
    -- Sin valor, la lectura tiene que decir por qué: un nulo mudo se lee como un cero.
    CONSTRAINT "node_derived_reading_nulo_con_razon" CHECK ("value" IS NOT NULL OR cardinality("limitations") > 0)
);

CREATE UNIQUE INDEX "node_calibration_hive_node_id_calibration_id_key" ON "apiary"."node_calibration"("hive_node_id", "calibration_id");
CREATE UNIQUE INDEX "node_derived_reading_observation_id_variable_algorithm_algo_key" ON "apiary"."node_derived_reading"("observation_id", "variable", "algorithm", "algorithm_version", "calibration_id");

ALTER TABLE "apiary"."node_calibration" ADD CONSTRAINT "node_calibration_hive_node_id_fkey" FOREIGN KEY ("hive_node_id") REFERENCES "apiary"."hive_node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apiary"."node_calibration" ADD CONSTRAINT "node_calibration_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apiary"."node_calibration" ADD CONSTRAINT "node_calibration_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "apiary"."node_derived_reading" ADD CONSTRAINT "node_derived_reading_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "apiary"."node_observation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apiary"."node_derived_reading" ADD CONSTRAINT "node_derived_reading_calibration_id_fkey" FOREIGN KEY ("calibration_id") REFERENCES "apiary"."node_calibration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apiary"."node_derived_reading" ADD CONSTRAINT "node_derived_reading_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Una calibración no se reescribe: recalibrar es otro registro.
CREATE FUNCTION "apiary"."node_calibration_inmutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'node_calibration es inmutable: recalibrar es un registro nuevo con otro calibration_id';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "node_calibration_inmutable"
  BEFORE UPDATE ON "apiary"."node_calibration"
  FOR EACH ROW EXECUTE FUNCTION "apiary"."node_calibration_inmutable"();
