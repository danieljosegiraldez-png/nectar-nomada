-- S1 — la calicata (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2,
-- semanas 3–6; Paso 4 del plan de acción del marco).
--
-- Aditiva: un tipo nuevo y dos tablas nuevas. Nada existente cambia.
--
-- Por qué esto va antes que la química: es DESCRIPCIÓN, no análisis. No depende
-- de ningún laboratorio ni de ninguna cotización, así que puede aterrizar en las
-- semanas 3–6 mientras el Paso 5 todavía está pidiendo precios. El marco lo
-- llama la actividad de mayor valor y menor coste del Año 0.
--
-- Lo requerido y por qué:
--   location_id       el bloque descrito, y el ancla de RBAC.
--   described_at      una calicata es la observación de un día, y §14 pide
--                     repetirla: la del Año 0 y la de dentro de tres años son
--                     dos filas, no una editada.
--   provenance_class  ADR-038. Descrita por quien la cavó o transcrita de la
--                     libreta de otro no son la misma afirmación.
--
-- Todo lo demás nullable y sin default: una calicata que salió a roca a los
-- 40 cm no tiene profundidad de raíces que anotar, y un cero ahí sería una
-- medición que nadie hizo (ADR-080).

-- Tres estados, no un booleano. «No se miró» y «se miró y no había» son hechos
-- distintos, y un booleano nullable los confunde en cuanto alguien lee `NOT`.
CREATE TYPE "traceability"."SoilFeatureObservation" AS ENUM ('present', 'absent', 'not_observed');

CREATE TABLE "traceability"."soil_profile" (
  "id"                         UUID NOT NULL DEFAULT gen_random_uuid(),
  "location_id"                UUID NOT NULL,
  "described_at"               TIMESTAMP(3) NOT NULL,
  "pit_depth_cm"               INTEGER,
  "rooting_depth_cm"           INTEGER,
  "root_distribution"          TEXT,
  -- §6.1 del marco: las señales visuales de anaerobiosis periódica.
  "mottling"                   "traceability"."SoilFeatureObservation",
  "grey_colours"               "traceability"."SoilFeatureObservation",
  "root_channel_concretions"   "traceability"."SoilFeatureObservation",
  "sour_smell"                 "traceability"."SoilFeatureObservation",
  "impeding_layer_depth_cm"    INTEGER,
  "impeding_layer_note"        TEXT,
  "notes"                      TEXT,
  "provenance_class"           "core"."ProvenanceClass" NOT NULL,
  "source_reference"           TEXT,
  "data_quality"               "core"."DataQuality",
  "created_at"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                 TIMESTAMP(3) NOT NULL,
  "created_by"                 UUID,

  CONSTRAINT "soil_profile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "soil_profile_location_id_idx" ON "traceability"."soil_profile"("location_id");

ALTER TABLE "traceability"."soil_profile"
  ADD CONSTRAINT "soil_profile_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "soil_profile_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tabla hija y no un bloque de texto: el Paso 4 pide describir los horizontes
-- en plural, y la profundidad a la que cambia el material es justo lo que hay
-- que poder comparar entre bloques y entre años. Un párrafo no se compara.
CREATE TABLE "traceability"."soil_horizon" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "soil_profile_id" UUID NOT NULL,
  -- Orden desde la superficie, explícito y no derivado de top_cm: un horizonte
  -- cuya profundidad nadie midió sigue teniendo un sitio en la secuencia.
  "ordinal"         INTEGER NOT NULL,
  "top_cm"          INTEGER,
  "bottom_cm"       INTEGER,
  "designation"     TEXT,
  "colour"          TEXT,
  "structure"       TEXT,
  "texture_by_feel" TEXT,
  "notes"           TEXT,

  CONSTRAINT "soil_horizon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "soil_horizon_soil_profile_id_ordinal_key"
  ON "traceability"."soil_horizon"("soil_profile_id", "ordinal");
CREATE INDEX "soil_horizon_soil_profile_id_idx" ON "traceability"."soil_horizon"("soil_profile_id");

-- CASCADE, a diferencia de casi todo lo demás en este esquema: un horizonte no
-- existe sin su perfil. No es un registro con vida propia al que otra cosa
-- pueda apuntar; es una parte de la descripción.
ALTER TABLE "traceability"."soil_horizon"
  ADD CONSTRAINT "soil_horizon_soil_profile_id_fkey"
  FOREIGN KEY ("soil_profile_id") REFERENCES "traceability"."soil_profile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
