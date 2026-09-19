-- Paso 2a (spec §4.1): el estante y sus posiciones. Una posición es una
-- drying_bed hija del estante, con nivel (rack_level, ya existe) y PUESTO.
ALTER TABLE "core"."location" ADD COLUMN "rack_slot" INTEGER;
ALTER TABLE "core"."location"
  ADD CONSTRAINT "location_rack_slot_positivo" CHECK ("rack_slot" IS NULL OR "rack_slot" > 0);

-- Una posición no se repite en su estante.
CREATE UNIQUE INDEX "location_posicion_unica"
  ON "core"."location"("parent_location_id", "rack_level", "rack_slot")
  WHERE "rack_slot" IS NOT NULL;

-- El árbol del estante mira el tipo del PADRE: otra fila, así que disparador.
CREATE OR REPLACE FUNCTION "core"."exigir_arbol_de_estante"()
RETURNS TRIGGER AS $$
DECLARE tipo_padre TEXT;
BEGIN
  -- Del lado del PADRE (revisión de Codex del plan 2a): una instalación con
  -- estantes, o un estante con posiciones, no cambia de tipo. Sin esto, pasar
  -- una instalación a `site` dejaba sus estantes colgando de un padre inválido.
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
  END IF;
  SELECT "location_type"::TEXT INTO tipo_padre FROM "core"."location" WHERE "id" = NEW."parent_location_id";
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

CREATE TRIGGER "location_arbol_de_estante"
  BEFORE INSERT OR UPDATE OF "location_type", "parent_location_id", "rack_level", "rack_slot"
  ON "core"."location"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_arbol_de_estante"();
