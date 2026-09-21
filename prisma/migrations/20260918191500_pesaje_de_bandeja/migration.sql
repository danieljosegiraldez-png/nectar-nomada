-- Paso 2a (spec §4.2b): el pesaje de una bandeja cargada, protocolo de §7 del
-- plan de secado de Las Nubes Cerro Azul 2026-27. Es measured_fact: no se edita;
-- una corrección es un registro nuevo que supersede (00_conventions §4).
CREATE TABLE "traceability"."drying_tray_weighing" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tray_type_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "material_state" "core"."MaterialState" NOT NULL,
  "net_kg" DECIMAL(10,3) NOT NULL,
  "depth_points_cm" DECIMAL(5,1)[] NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  -- `created_at`, no `recorded_at`: a diferencia de las seis tablas de captura en
  -- dispositivo (`tests/arquitectura/columnas-de-sincronizacion.test.ts`), esta
  -- columna nunca la escribe el cliente — sale de `DEFAULT CURRENT_TIMESTAMP`,
  -- el reloj del SERVIDOR al insertar, igual que `drying_tray_type.created_at`
  -- (Tarea 3). No es «el reloj del teléfono cuando el operador lo tecleó» —esa
  -- semántica es la que exige `synced_at`/`device_id`/`clock_offset_ms`, que
  -- este pesaje no tiene ni necesita— así que llamarla `recorded_at` habría sido
  -- un nombre importado del patrón equivocado (desviación del brief, corregida
  -- aquí con evidencia: ver el informe de la Tarea 4).
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "operator_person_id" UUID,
  "provenance_class" "core"."ProvenanceClass" NOT NULL,
  "supersedes_id" UUID,
  "superseded_at" TIMESTAMP(3),
  "correction_reason" TEXT,
  "created_by" UUID,
  CONSTRAINT "drying_tray_weighing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "drying_tray_weighing_estado_de_secado" CHECK ("material_state" IN ('CHERRY', 'MUCILAGE_HONEY', 'PARCHMENT')),
  CONSTRAINT "drying_tray_weighing_peso_positivo" CHECK ("net_kg" > 0),
  -- Un CHECK que da NULL PASA. Por eso cada uno descarta el nulo explícitamente
  -- (revisión de Codex del plan 2a): [3, NULL, 3] pasaba cardinalidad y el ALL,
  -- y una corrección con razón NULL pasaba la razón.
  CONSTRAINT "drying_tray_weighing_tres_o_cuatro_puntos" CHECK (
    -- CASE y no AND: array_position exige una dimensión, y el orden de evaluación
    -- de un AND no está garantizado (segunda pasada de Codex).
    CASE WHEN array_ndims("depth_points_cm") = 1
      THEN cardinality("depth_points_cm") BETWEEN 3 AND 4 AND array_position("depth_points_cm", NULL) IS NULL
      ELSE false END
  ),
  CONSTRAINT "drying_tray_weighing_profundidad_positiva" CHECK (0 < ALL("depth_points_cm")),
  CONSTRAINT "drying_tray_weighing_correccion_con_razon" CHECK (
    "supersedes_id" IS NULL OR ("correction_reason" IS NOT NULL AND char_length(trim("correction_reason")) > 0)
  ),
  CONSTRAINT "drying_tray_weighing_medido" CHECK ("provenance_class" = 'measured_fact')
);
ALTER TABLE "traceability"."drying_tray_weighing"
  ADD CONSTRAINT "drying_tray_weighing_tray_type_id_fkey" FOREIGN KEY ("tray_type_id") REFERENCES "core"."drying_tray_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_tray_weighing_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- RESTRICT y no SET NULL: un SET NULL sería un UPDATE, que el disparador de
  -- inmutabilidad rechaza, y la autoría de una medida no se pierde en silencio.
  ADD CONSTRAINT "drying_tray_weighing_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_tray_weighing_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "traceability"."drying_tray_weighing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_tray_weighing_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "drying_tray_weighing_tray_type_id_idx" ON "traceability"."drying_tray_weighing"("tray_type_id");

-- Inmutable salvo marcarlo superseded UNA vez (00_conventions §4).
CREATE OR REPLACE FUNCTION "traceability"."pesaje_inmutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."superseded_at" IS NULL AND NEW."superseded_at" IS NOT NULL
     AND (to_jsonb(NEW) - 'superseded_at') = (to_jsonb(OLD) - 'superseded_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Un pesaje no se edita: se corrige con un registro nuevo que lo supersede';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "drying_tray_weighing_inmutable"
  BEFORE UPDATE ON "traceability"."drying_tray_weighing"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."pesaje_inmutable"();

-- Tampoco se borra (00_conventions §4; revisión de Codex del plan 2a). La única
-- puerta es un ajuste de SESIÓN que sólo pone la limpieza de las pruebas, dentro
-- de su transacción con SET LOCAL: la aplicación no lo pone en ningún sitio, y un
-- guardia de fuente lo comprueba (paso 4). Es la misma debilidad que tiene hoy
-- todo el proyecto —los roles de la base no revocan DELETE—, dicha en voz alta.
CREATE OR REPLACE FUNCTION "traceability"."pesaje_no_se_borra"()
RETURNS TRIGGER AS $$
BEGIN
  -- La puerta exige DOS cosas: el ajuste de sesión Y una base de PRUEBAS por su
  -- nombre (nectar_test, nectar_ci…, o la desechable nn_flip_…). En producción la
  -- base no se llama así, y el ajuste solo no abre nada (segunda pasada de Codex).
  IF current_setting('nn.limpieza_de_pruebas', true) = 'on'
     AND current_database() ~ '^(nectar_test|nectar_ci|nn_flip_)' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Un pesaje no se borra: se corrige con un registro nuevo que lo supersede';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "drying_tray_weighing_no_se_borra"
  BEFORE DELETE ON "traceability"."drying_tray_weighing"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."pesaje_no_se_borra"();

-- El tipo y el lote son de la MISMA organización. Las claves foráneas no lo
-- dicen, y un importador podría contaminar la capacidad de una finca con los
-- pesajes de otra (revisión de Codex del plan 2a).
CREATE OR REPLACE FUNCTION "traceability"."exigir_pesaje_de_una_organizacion"()
RETURNS TRIGGER AS $$
DECLARE org_tipo UUID; org_lote UUID;
BEGIN
  SELECT "organization_id" INTO org_tipo FROM "core"."drying_tray_type" WHERE "id" = NEW."tray_type_id";
  SELECT "organization_id" INTO org_lote FROM "traceability"."lot" WHERE "id" = NEW."lot_id";
  IF org_tipo IS DISTINCT FROM org_lote THEN
    RAISE EXCEPTION 'El pesaje mezcla organizaciones: el tipo de bandeja y el lote no son de la misma';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "drying_tray_weighing_una_organizacion"
  BEFORE INSERT ON "traceability"."drying_tray_weighing"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_pesaje_de_una_organizacion"();

-- Y del lado de los padres: un tipo con pesajes no se muda (se amplía la función
-- de la Tarea 3), ni un lote con pesajes cambia de organización.
CREATE OR REPLACE FUNCTION "core"."exigir_tipo_de_bandeja_quieto"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id" AND (
       EXISTS (SELECT 1 FROM "core"."equipment" WHERE "tray_type_id" = NEW."id")
    OR EXISTS (SELECT 1 FROM "traceability"."drying_tray_weighing" WHERE "tray_type_id" = NEW."id")
  ) THEN
    RAISE EXCEPTION 'Un tipo de bandeja con bandejas no cambia de organizacion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "traceability"."exigir_lote_con_pesajes_quieto"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
     AND EXISTS (SELECT 1 FROM "traceability"."drying_tray_weighing" WHERE "lot_id" = NEW."id") THEN
    RAISE EXCEPTION 'Un lote con pesajes de bandeja no cambia de organizacion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "lot_con_pesajes_quieto"
  BEFORE UPDATE OF "organization_id" ON "traceability"."lot"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_lote_con_pesajes_quieto"();
