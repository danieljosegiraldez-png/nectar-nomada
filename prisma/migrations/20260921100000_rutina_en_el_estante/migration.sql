-- Parte 2 de spec/2026-09-19-rutinas-de-instalaciones-y-bodega-design.md §7:
-- ahora que `drying_rack` está en `main` (secado-2a), el estante también
-- admite rutina propia. `CREATE OR REPLACE` sobre la función del disparador
-- de la migración 20260919201000: la restricción vivía sólo en TypeScript
-- (`lib/rutinas/lugares.ts`, `CON_RUTINA`) para este caso nuevo, y una regla
-- que vive sólo ahí no existe para un importador ni para SQL directo (regla
-- de la casa).
--
-- Sigue igual: una posición DENTRO de un estante (`drying_bed` cuyo padre es
-- un `drying_rack`) NO lleva rutina propia —la cubre la del estante—, y una
-- cama SUELTA (padre `drying_facility`) sí.
CREATE OR REPLACE FUNCTION "core"."care_routine_lugar_valido"() RETURNS trigger
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
  IF tipo IN ('beneficio', 'drying_facility', 'storage_facility', 'drying_rack') THEN
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
