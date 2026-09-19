-- Restricciones que la revisión final encontró sólo en el servicio (o en ninguna
-- parte). Van en la BASE: un importador o SQL directo no pasan por TypeScript.

-- ── Modelo: dueño y tipo no cambian (spec de catálogos) ──
-- Un modelo que cambia de organización arrastra a sus equipos a un catálogo
-- ajeno, y uno que cambia de tipo deja su FK compuesta (equipment.model_id, kind)
-- a merced del ON UPDATE CASCADE. Se retira y se crea otro.
CREATE FUNCTION "core"."equipment_model_dueno_y_tipo_inmutables"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id" THEN
    RAISE EXCEPTION 'equipment_model_dueno_inmutable' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."kind" IS DISTINCT FROM OLD."kind" THEN
    RAISE EXCEPTION 'equipment_model_tipo_inmutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "equipment_model_dueno_y_tipo_inmutables"
  BEFORE UPDATE ON "core"."equipment_model"
  FOR EACH ROW EXECUTE FUNCTION "core"."equipment_model_dueno_y_tipo_inmutables"();

-- ── Rutinas: una activa por (cosa, tipo); sólo `otra` distingue por su nota ──
-- La versión anterior metía la nota en la clave para TODOS los tipos, así que
-- dos `limpieza` activas con notas distintas convivían.
DROP INDEX "core"."care_routine_equipo_tipo_activa_key";
DROP INDEX "core"."care_routine_sitio_tipo_activa_key";
CREATE UNIQUE INDEX "care_routine_equipo_tipo_activa_key"
  ON "core"."care_routine" ("equipment_id", "kind", (CASE WHEN "kind" = 'otra' THEN lower(btrim("kind_note")) ELSE '' END))
  WHERE "retired_at" IS NULL AND "equipment_id" IS NOT NULL;
CREATE UNIQUE INDEX "care_routine_sitio_tipo_activa_key"
  ON "core"."care_routine" ("location_id", "kind", (CASE WHEN "kind" = 'otra' THEN lower(btrim("kind_note")) ELSE '' END))
  WHERE "retired_at" IS NULL AND "location_id" IS NOT NULL;

-- ── Textos obligatorios que no pueden ser sólo espacios ──
-- `IS NOT NULL` acepta '   ', que es un motivo que no dice nada.
ALTER TABLE "core"."care_routine_event"
  ADD CONSTRAINT "care_routine_event_motivo_no_vacio" CHECK ("void_reason" IS NULL OR btrim("void_reason") <> '');
ALTER TABLE "core"."care_routine"
  ADD CONSTRAINT "care_routine_nota_no_vacia" CHECK ("kind_note" IS NULL OR btrim("kind_note") <> '');
ALTER TABLE "core"."equipment_model"
  ADD CONSTRAINT "equipment_model_nota_de_material_no_vacia" CHECK ("contact_material_note" IS NULL OR btrim("contact_material_note") <> '');
