-- F1 (revisión final 2 del plan 2a de secado, C-1/O-1): el disparador del
-- árbol de estantes leía el TIPO del padre sin bloquearlo — la misma clase de
-- carrera que 20260918191800 cerró para los otros dos disparadores (tipo de
-- bandeja y pesaje), dejada abierta aquí. NO se edita 20260918191800: su
-- checksum vive en la base compartida.
CREATE OR REPLACE FUNCTION "core"."exigir_arbol_de_estante"()
RETURNS TRIGGER AS $$
DECLARE tipo_padre TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."location_type" IS DISTINCT FROM OLD."location_type" THEN
    IF NEW."location_type" <> 'drying_facility' AND EXISTS (
      SELECT 1 FROM "core"."location" WHERE "parent_location_id" = NEW."id" AND "location_type" = 'drying_rack'
    ) THEN
      RAISE EXCEPTION 'Una instalacion con estantes no cambia de tipo';
    END IF;
    IF NEW."location_type" <> 'drying_rack' AND EXISTS (
      SELECT 1 FROM "core"."location" WHERE "parent_location_id" = NEW."id" AND "rack_slot" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Un estante con posiciones no cambia de tipo';
    END IF;
    IF NEW."location_type" = 'drying_rack' AND EXISTS (
      SELECT 1 FROM "core"."location"
      WHERE "parent_location_id" = NEW."id" AND "location_type" = 'drying_bed'
        AND ("rack_level" IS NULL OR "rack_slot" IS NULL)
    ) THEN
      RAISE EXCEPTION 'Un lugar con camas sin nivel ni puesto no puede convertirse en estante';
    END IF;
  END IF;
  -- F1: bloqueado con FOR SHARE — sin esto, un INSERT/UPDATE de un hijo podía
  -- leer el tipo VIEJO del padre mientras otra transacción, todavía sin
  -- confirmar, le cambiaba el tipo; el hijo podía terminar colgando de un
  -- padre que ya no es (o nunca fue) del tipo que el hijo asumió.
  SELECT "location_type"::TEXT INTO tipo_padre FROM "core"."location" WHERE "id" = NEW."parent_location_id" FOR SHARE;
  IF NEW."location_type" = 'drying_rack' AND tipo_padre IS DISTINCT FROM 'drying_facility' THEN
    RAISE EXCEPTION 'Un estante debe colgar de una instalacion de secado (cuelga de %)', tipo_padre;
  END IF;
  IF NEW."location_type" = 'drying_bed' AND tipo_padre = 'drying_rack'
     AND (NEW."rack_level" IS NULL OR NEW."rack_slot" IS NULL) THEN
    RAISE EXCEPTION 'Una posicion de estante lleva nivel y puesto';
  END IF;
  IF NEW."rack_slot" IS NOT NULL AND (NEW."location_type" <> 'drying_bed' OR tipo_padre IS DISTINCT FROM 'drying_rack') THEN
    RAISE EXCEPTION 'El puesto solo en una posicion de estante';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
