-- Revisión independiente de Codex sobre spec/instalaciones-rutinas, plegada en
-- la ola de arreglos de la revisión final (2026-09-19). Tres restricciones que
-- sólo vivían en TypeScript, ahora también en la base — regla de la casa: una
-- restricción que vive en TypeScript no existe para un importador ni para SQL
-- directo.

-- ── Hallazgo D: un padre que deja de ser `beneficio`/`site` con bodegas
-- debajo se quedaría huérfano en silencio ──
-- `location_bodega_padre` (migración 20260919200500) sólo miraba la fila que
-- cambia de tipo; si la que cambia es el PADRE (una finca que pasa a `plot`),
-- devolvía temprano sin comprobar si alguna bodega cuelga de ella.
CREATE OR REPLACE FUNCTION "core"."location_bodega_padre"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tipo_padre text;
  hijos_bodega integer;
BEGIN
  IF NEW."location_type"::text = 'storage_facility' THEN
    IF NEW."parent_location_id" IS NULL THEN
      RAISE EXCEPTION 'bodega_padre_invalido' USING ERRCODE = 'check_violation';
    END IF;
    SELECT "location_type"::text INTO tipo_padre FROM "core"."location" WHERE "id" = NEW."parent_location_id";
    IF tipo_padre IS NULL OR tipo_padre NOT IN ('beneficio', 'site') THEN
      RAISE EXCEPTION 'bodega_padre_invalido' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Sólo aplica en UPDATE: en un INSERT ninguna fila puede apuntar todavía,
  -- como padre, a un id que se está creando ahora mismo.
  IF TG_OP = 'UPDATE' AND NEW."location_type"::text NOT IN ('beneficio', 'site') THEN
    SELECT count(*) INTO hijos_bodega FROM "core"."location"
      WHERE "parent_location_id" = NEW."id" AND "location_type"::text = 'storage_facility';
    IF hijos_bodega > 0 THEN
      RAISE EXCEPTION 'bodega_padre_invalido' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Hallazgo E: qué lugar admite rutina propia sólo vivía en `lugares.ts`
-- (`lugarParaRutina`) ──
CREATE FUNCTION "core"."care_routine_lugar_valido"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tipo text;
  padre_id uuid;
  tipo_padre text;
BEGIN
  IF NEW."location_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "location_type"::text, "parent_location_id" INTO tipo, padre_id
    FROM "core"."location" WHERE "id" = NEW."location_id";
  IF tipo IS NULL THEN
    RAISE EXCEPTION 'rutina_lugar_invalido' USING ERRCODE = 'check_violation';
  END IF;
  IF tipo IN ('beneficio', 'drying_facility', 'storage_facility') THEN
    RETURN NEW;
  END IF;
  IF tipo = 'drying_bed' AND padre_id IS NOT NULL THEN
    SELECT "location_type"::text INTO tipo_padre FROM "core"."location" WHERE "id" = padre_id;
    IF tipo_padre = 'drying_facility' THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'rutina_lugar_invalido' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "care_routine_lugar_valido"
  BEFORE INSERT OR UPDATE OF "location_id" ON "core"."care_routine"
  FOR EACH ROW EXECUTE FUNCTION "core"."care_routine_lugar_valido"();

-- ── Hallazgo C: el insumo de una rutina, de la MISMA organización que el
-- lugar o el equipo de la rutina — antes sólo se comparaba en TypeScript
-- después de leer los lotes por id ──
CREATE FUNCTION "traceability"."consumo_de_rutina_misma_organizacion"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  org_rutina uuid;
  org_lote uuid;
BEGIN
  IF NEW."care_routine_event_id" IS NULL OR NEW."consumable_lot_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(loc."organization_id", eq."organization_id") INTO org_rutina
    FROM "core"."care_routine_event" cre
    JOIN "core"."care_routine" cr ON cr."id" = cre."routine_id"
    LEFT JOIN "core"."location" loc ON loc."id" = cr."location_id"
    LEFT JOIN "core"."equipment" eq ON eq."id" = cr."equipment_id"
    WHERE cre."id" = NEW."care_routine_event_id";

  SELECT cm."organization_id" INTO org_lote
    FROM "traceability"."consumable_lot" cl
    JOIN "traceability"."consumable_material" cm ON cm."id" = cl."material_id"
    WHERE cl."id" = NEW."consumable_lot_id";

  -- Un lugar sin organización (bodega de plataforma) no tiene con qué
  -- comparar: se rechaza, igual que ya hacía el servicio en TypeScript
  -- (`insumo_ajeno` para CUALQUIER insumo cuando el lugar no tiene org).
  IF org_rutina IS NULL OR org_lote IS NULL OR org_rutina <> org_lote THEN
    RAISE EXCEPTION 'insumo_de_otra_organizacion' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "consumo_de_rutina_misma_organizacion"
  BEFORE INSERT OR UPDATE OF "care_routine_event_id", "consumable_lot_id" ON "traceability"."material_consumption_entry"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."consumo_de_rutina_misma_organizacion"();
