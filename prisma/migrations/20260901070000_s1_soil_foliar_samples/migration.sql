-- S1 — muestra de suelo y muestra foliar
-- (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2, semanas 6-10; Paso 6).
--
-- Aditiva: un tipo, dos tablas y dos columnas nullable en `measurement`.
--
-- **La muestra y el resultado son dos cosas distintas y no se funden.** Estas
-- tablas guardan la MUESTRA —de dónde salió, de qué profundidad, de cuántas
-- submuestras, a qué laboratorio, con qué extractante—. Los resultados de la
-- Tabla 3 son `measurement`, que ya sabe superseder una corrección sin borrar
-- la original, y por eso las dos columnas nuevas de abajo.
--
-- Ninguna reusa `sample`: esa tabla es de café y lleva `source_lot_id`,
-- `source_transformation_id`, códigos ciegos de sensorial y entradas de
-- competencia. Nada de eso significa algo para un puñado de tierra.

-- §7.1 — «tercio superior, medio o inferior». La lista la da el marco.
CREATE TYPE "traceability"."CanopyPosition" AS ENUM ('upper', 'middle', 'lower');

CREATE TABLE "traceability"."soil_sample" (
  "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
  "sample_code"           TEXT NOT NULL,
  "location_id"           UUID NOT NULL,
  -- Texto y no una clave: el diseño del ensayo (T0-T4) es el Paso 8 y el
  -- muestreo del Paso 6 ocurre ANTES. No puede esperar a que el ensayo exista.
  "treatment_plot_label"  TEXT,
  -- §14.1: punto permanente y etiquetado, «para que las rondas siguientes
  -- vuelvan al mismo sitio». Sin él, una serie de química de suelo compara
  -- sitios distintos y lo llama cambio.
  "sampling_point_label"  TEXT,
  -- Dos enteros y no un enum de tres bandas: §14.1 dice 0-20, 20-40 y 40-60
  -- «aproximadamente», y una cuarta profundidad no debe obligar a migrar.
  "depth_top_cm"          INTEGER,
  "depth_bottom_cm"       INTEGER,
  "sampled_at"            TIMESTAMP(3) NOT NULL,
  -- 10-15 submuestras por parcela y profundidad. Compositar dentro de una
  -- parcela y una profundidad; nunca entre tratamientos ni entre profundidades.
  -- La regla es estructural: una fila ES un compuesto de una parcela y una
  -- profundidad.
  "sub_sample_count"      INTEGER,
  "laboratory"            TEXT,
  -- «El fósforo es muy dependiente del método — anotar el extractante»
  -- (Tabla 3). Un P Bray y un P Mehlich no se comparan.
  "extraction_method"     TEXT,
  "notes"                 TEXT,
  "provenance_class"      "core"."ProvenanceClass" NOT NULL,
  "source_reference"      TEXT,
  "data_quality"          "core"."DataQuality",
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL,
  "created_by"            UUID,

  CONSTRAINT "soil_sample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "soil_sample_location_id_sample_code_key"
  ON "traceability"."soil_sample"("location_id", "sample_code");
CREATE INDEX "soil_sample_location_id_idx" ON "traceability"."soil_sample"("location_id");

ALTER TABLE "traceability"."soil_sample"
  ADD CONSTRAINT "soil_sample_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "soil_sample_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- §7.1 es el motivo de que casi todas estas columnas existan: la concentración
-- foliar varía con la posición de la hoja, su edad, el cultivar, la fenología y
-- la estación, así que un análisis foliar SIN su protocolo no es un dato peor,
-- es un dato incomparable — y eso es peor que no tenerlo, porque parece servir.
CREATE TABLE "traceability"."foliar_sample" (
  "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
  "sample_code"           TEXT NOT NULL,
  "location_id"           UUID NOT NULL,
  "treatment_plot_label"  TEXT,
  "sampled_at"            TIMESTAMP(3) NOT NULL,
  -- Un entero y no un enum: el marco dice que fijar el par exacto es un acuerdo
  -- con el laboratorio, no una constante nuestra.
  "leaf_pair_position"    INTEGER,
  "canopy_position"       "traceability"."CanopyPosition",
  "tree_age_years"        INTEGER,
  "cultivar"              TEXT,
  "phenological_stage"    TEXT,
  -- Booleano nullable y no tres estados como en la calicata: aquí no hay «no se
  -- miró» plausible, porque quien arranca la hoja tiene la rama en la mano.
  "branch_bearing_fruit"  BOOLEAN,
  "laboratory"            TEXT,
  "notes"                 TEXT,
  "provenance_class"      "core"."ProvenanceClass" NOT NULL,
  "source_reference"      TEXT,
  "data_quality"          "core"."DataQuality",
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL,
  "created_by"            UUID,

  CONSTRAINT "foliar_sample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "foliar_sample_location_id_sample_code_key"
  ON "traceability"."foliar_sample"("location_id", "sample_code");
CREATE INDEX "foliar_sample_location_id_idx" ON "traceability"."foliar_sample"("location_id");

ALTER TABLE "traceability"."foliar_sample"
  ADD CONSTRAINT "foliar_sample_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "foliar_sample_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Los otros dos sujetos que no son café, con la misma forma que
-- biochar_batch_id: independientes, excluyen lot_id en vez de exigirlo.
ALTER TABLE "traceability"."measurement"
  ADD COLUMN "soil_sample_id"   UUID,
  ADD COLUMN "foliar_sample_id" UUID;

CREATE INDEX "measurement_soil_sample_id_idx"   ON "traceability"."measurement"("soil_sample_id");
CREATE INDEX "measurement_foliar_sample_id_idx" ON "traceability"."measurement"("foliar_sample_id");

ALTER TABLE "traceability"."measurement"
  ADD CONSTRAINT "measurement_soil_sample_id_fkey"
  FOREIGN KEY ("soil_sample_id") REFERENCES "traceability"."soil_sample"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "measurement_foliar_sample_id_fkey"
  FOREIGN KEY ("foliar_sample_id") REFERENCES "traceability"."foliar_sample"("id") ON DELETE SET NULL ON UPDATE CASCADE;
