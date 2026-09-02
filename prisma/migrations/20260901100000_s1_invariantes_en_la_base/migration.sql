-- S1 — lo que el código decía «estructural» y sólo comprobaba el servicio
-- (tercera revisión independiente, 2026-09-01).
--
-- Su encuadre, que es el hallazgo de verdad: **creer que una validación del
-- servicio ya es una propiedad del modelo**. Un importador, una reparación
-- operativa o SQL directo se saltan el servicio; una restricción que sólo vive
-- en TypeScript o en un comentario no existe para la base.
--
-- Comprobado antes de escribir esto: CERO filas vivas incumplen cualquiera de
-- los CHECK de abajo, y `traceability.measurement` no tenía ni un solo CHECK.
--
-- Todo es aditivo. Nada borra ni transforma filas.

-- ---------------------------------------------------------------------------
-- 1. El sujeto de una medición es UNO.
--
--    El SQL de la migración que añadió estas columnas decía que cada sujeto
--    nuevo «excluye lot_id». No lo hacía: sólo lo comprobaba `recordMeasurement`.
--    Una fila podía ser a la vez de una muestra de suelo y de una foliar, y eso
--    son dos ámbitos de RBAC y dos hechos posibles: ni interpretación ni
--    autorización inequívocas.
-- ---------------------------------------------------------------------------
ALTER TABLE "traceability"."measurement"
  ADD CONSTRAINT "measurement_sujeto_no_cafe_exclusivo"
  CHECK (
    num_nonnulls("biochar_batch_id", "soil_sample_id", "foliar_sample_id") = 0
    OR (
      num_nonnulls("biochar_batch_id", "soil_sample_id", "foliar_sample_id") = 1
      AND "lot_id" IS NULL
      AND "sample_id" IS NULL
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Borrar el sujeto no deja la evidencia sin sujeto.
--
--    Las tres FK nuevas eran ON DELETE SET NULL: borrar una muestra dejaba la
--    lectura viva **sin decir de qué era**, y borrar un lote de biochar dejaba
--    la foto del retorte sin objeto. Conservar el número y perder el sujeto no
--    es conservar evidencia. RESTRICT es lo coherente con evidencia original
--    inmutable: si alguien quiere borrar el padre, que se entere.
-- ---------------------------------------------------------------------------
ALTER TABLE "traceability"."measurement"
  DROP CONSTRAINT "measurement_biochar_batch_id_fkey",
  DROP CONSTRAINT "measurement_soil_sample_id_fkey",
  DROP CONSTRAINT "measurement_foliar_sample_id_fkey";

ALTER TABLE "traceability"."measurement"
  ADD CONSTRAINT "measurement_biochar_batch_id_fkey"
  FOREIGN KEY ("biochar_batch_id") REFERENCES "traceability"."biochar_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "measurement_soil_sample_id_fkey"
  FOREIGN KEY ("soil_sample_id") REFERENCES "traceability"."soil_sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "measurement_foliar_sample_id_fkey"
  FOREIGN KEY ("foliar_sample_id") REFERENCES "traceability"."foliar_sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "core"."asset"
  DROP CONSTRAINT "asset_biochar_batch_id_fkey",
  DROP CONSTRAINT "asset_soil_profile_id_fkey";

ALTER TABLE "core"."asset"
  ADD CONSTRAINT "asset_biochar_batch_id_fkey"
  FOREIGN KEY ("biochar_batch_id") REFERENCES "traceability"."biochar_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "asset_soil_profile_id_fkey"
  FOREIGN KEY ("soil_profile_id") REFERENCES "traceability"."soil_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Hechos que no pueden ser hechos.
--
--    El servicio ya los rechaza. La base los aceptaba: un horizonte que empieza
--    más abajo de donde acaba, raíces más hondas que el hoyo desde el que se
--    miraron, un compuesto de -3 submuestras, un árbol de -5 años.
--
--    Lo que NO se añade, y es deliberado: nada que exija que un campo de
--    protocolo esté relleno. La tercera revisión propuso hacer NOT NULL el par
--    de hojas, la posición en el dosel y el estado fenológico porque «un
--    análisis foliar sin protocolo es incomparable». Lo es — y por eso la ficha
--    dice CUÁLES faltan. Prohibir la fila perdería el dato en vez de señalarlo,
--    y una muestra real cuyo protocolo no se siguió sigue siendo un hecho.
-- ---------------------------------------------------------------------------
ALTER TABLE "traceability"."soil_horizon"
  ADD CONSTRAINT "soil_horizon_ordinal_positivo" CHECK ("ordinal" >= 1),
  ADD CONSTRAINT "soil_horizon_profundidad_no_negativa"
    CHECK (("top_cm" IS NULL OR "top_cm" >= 0) AND ("bottom_cm" IS NULL OR "bottom_cm" >= 0)),
  ADD CONSTRAINT "soil_horizon_top_sobre_bottom"
    CHECK ("top_cm" IS NULL OR "bottom_cm" IS NULL OR "top_cm" <= "bottom_cm");

ALTER TABLE "traceability"."soil_profile"
  ADD CONSTRAINT "soil_profile_profundidades_no_negativas"
    CHECK (("pit_depth_cm" IS NULL OR "pit_depth_cm" >= 0)
       AND ("rooting_depth_cm" IS NULL OR "rooting_depth_cm" >= 0)
       AND ("impeding_layer_depth_cm" IS NULL OR "impeding_layer_depth_cm" >= 0)),
  -- Las raíces no llegan más hondo que el hoyo desde el que se miraron.
  ADD CONSTRAINT "soil_profile_raices_dentro_del_hoyo"
    CHECK ("pit_depth_cm" IS NULL OR "rooting_depth_cm" IS NULL OR "rooting_depth_cm" <= "pit_depth_cm");

ALTER TABLE "traceability"."soil_sample"
  ADD CONSTRAINT "soil_sample_profundidad_no_negativa"
    CHECK (("depth_top_cm" IS NULL OR "depth_top_cm" >= 0) AND ("depth_bottom_cm" IS NULL OR "depth_bottom_cm" >= 0)),
  ADD CONSTRAINT "soil_sample_banda_bien_orientada"
    CHECK ("depth_top_cm" IS NULL OR "depth_bottom_cm" IS NULL OR "depth_top_cm" < "depth_bottom_cm"),
  -- Cero submuestras no es un compuesto pobre: es un error de tecleo.
  ADD CONSTRAINT "soil_sample_submuestras_positivas"
    CHECK ("sub_sample_count" IS NULL OR "sub_sample_count" >= 1);

ALTER TABLE "traceability"."foliar_sample"
  ADD CONSTRAINT "foliar_sample_par_de_hojas_positivo"
    CHECK ("leaf_pair_position" IS NULL OR "leaf_pair_position" >= 1),
  ADD CONSTRAINT "foliar_sample_edad_no_negativa"
    CHECK ("tree_age_years" IS NULL OR "tree_age_years" >= 0);

ALTER TABLE "traceability"."biochar_batch"
  ADD CONSTRAINT "biochar_batch_magnitudes_no_negativas"
    CHECK (("peak_temperature_c" IS NULL OR "peak_temperature_c" >= 0)
       AND ("burn_duration_minutes" IS NULL OR "burn_duration_minutes" >= 0)
       AND ("time_at_peak_minutes" IS NULL OR "time_at_peak_minutes" >= 0)
       AND ("charging_duration_days" IS NULL OR "charging_duration_days" >= 0)),
  -- El tiempo a pico cabe dentro de la quema.
  ADD CONSTRAINT "biochar_batch_pico_dentro_de_la_quema"
    CHECK ("burn_duration_minutes" IS NULL OR "time_at_peak_minutes" IS NULL
        OR "time_at_peak_minutes" <= "burn_duration_minutes");

-- ---------------------------------------------------------------------------
-- 4. Lo que NO se puede llevar a la base, y por qué queda escrito aquí.
--
--    La tercera revisión pidió una FK compuesta que ate la organización de un
--    `biochar_batch` —y la de un `treatment_batch`— a la de su Location, para
--    que la base impida lo que hoy sólo impide el servicio.
--
--    **No se puede, y la razón es del modelo:** `core.location.organization_id`
--    es NULLABLE a propósito, porque una parcela hereda el dueño de su finca.
--    Una FK compuesta con una columna nula pasa por MATCH SIMPLE, así que no
--    restringiría nada para justo las filas que más importan — las parcelas que
--    heredan. Imponerlo exigiría desnormalizar la organización a cada Location,
--    que es la duplicación que el repositorio evita, o un trigger, que no es
--    declarativo.
--
--    Así que la regla vive en `resolveOrganizationForLocation` y en
--    `applyAmendment`, y esto queda dicho aquí en vez de prometido en un
--    comentario que no impone nada.
