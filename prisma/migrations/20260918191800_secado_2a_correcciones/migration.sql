-- Revisión final del plan 2a de secado (2026-09-19), A8 (C-1, C-2, C-3 de la
-- revisión independiente). NO se editan las migraciones ya aplicadas: sus
-- checksums viven en la base compartida (`nectar_test`) y en producción.
-- El informe completo de esta corrección vive en
-- .superpowers/sdd/2026-09-18-secado-2a-estantes-y-bandejas/final-findings.md
-- (no versionado con el proyecto; ver ADR para el resumen).

-- (1) Carrera padre/hijo entre organizaciones (C-1 / P1 de Codex): un pesaje
-- se insertaba leyendo la organización del tipo y del lote SIN bloquearlos,
-- así que un UPDATE concurrente de esa organización —todavía sin confirmar—
-- no se veía, y el pesaje podía quedar mezclando dos organizaciones. `FOR
-- SHARE` hace que el INSERT espere a que ese UPDATE termine (confirme o
-- revierta) antes de leer el valor definitivo. Mismo orden de bloqueo en
-- TODOS los disparadores que tocan estos dos padres: primero el TIPO, después
-- el LOTE — evita un interbloqueo cruzado con cualquier otra ruta que bloquee
-- los dos en el mismo orden.
--
-- De paso (3): la corrección debe ser del MISMO tipo de bandeja que el
-- original — el servicio ya lo comprueba, pero un INSERT directo no pasaba
-- por el servicio. Se bloquea también el original (mismo orden: después del
-- tipo y el lote, antes de terminar la función) porque su tipo puede estar
-- correspondiéndose con un `supersededAt` escrito por otra transacción.
CREATE OR REPLACE FUNCTION "traceability"."exigir_pesaje_de_una_organizacion"()
RETURNS TRIGGER AS $$
DECLARE org_tipo UUID; org_lote UUID; tipo_original UUID;
BEGIN
  SELECT "organization_id" INTO org_tipo FROM "core"."drying_tray_type" WHERE "id" = NEW."tray_type_id" FOR SHARE;
  SELECT "organization_id" INTO org_lote FROM "traceability"."lot" WHERE "id" = NEW."lot_id" FOR SHARE;
  IF org_tipo IS DISTINCT FROM org_lote THEN
    RAISE EXCEPTION 'El pesaje mezcla organizaciones: el tipo de bandeja y el lote no son de la misma';
  END IF;
  IF NEW."supersedes_id" IS NOT NULL THEN
    SELECT "tray_type_id" INTO tipo_original FROM "traceability"."drying_tray_weighing" WHERE "id" = NEW."supersedes_id" FOR SHARE;
    IF tipo_original IS DISTINCT FROM NEW."tray_type_id" THEN
      RAISE EXCEPTION 'La correccion debe ser del mismo tipo de bandeja que el pesaje original';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- (1), continuado: del lado del equipo (una bandeja apuntando a su tipo) — el
-- mismo patrón, un único padre que bloquear.
CREATE OR REPLACE FUNCTION "core"."exigir_tipo_de_bandeja_propio"()
RETURNS TRIGGER AS $$
DECLARE org UUID;
BEGIN
  IF NEW."tray_type_id" IS NULL THEN RETURN NEW; END IF;
  SELECT "organization_id" INTO org FROM "core"."drying_tray_type" WHERE "id" = NEW."tray_type_id" FOR SHARE;
  IF org IS DISTINCT FROM NEW."organization_id" THEN
    RAISE EXCEPTION 'El tipo de bandeja es de otra organizacion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- (2) Un pesaje es supersedido por A LO SUMO un sustituto (C-2 / P1 de Codex):
-- sin esto, dos correcciones podían apuntar al mismo original, o dos
-- transacciones podían insertar cada una su sustituto del mismo original a la
-- vez sin que ninguna lo viera.
CREATE UNIQUE INDEX "drying_tray_weighing_supersedes_unico"
  ON "traceability"."drying_tray_weighing"("supersedes_id") WHERE "supersedes_id" IS NOT NULL;

-- (4) Lado del PADRE al cambiar de tipo (C-3 / P2 de Codex): convertir una
-- instalación con camas SIN nivel/puesto directamente en estante dejaba esas
-- camas como "posiciones" sin coordenadas — ningún disparador las toca al
-- cambiar el tipo del PADRE, así que el árbol quedaba incoherente sin que
-- nada lo dijera.
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
    -- Nuevo: convertirse EN estante exige que las camas que ya cuelgan de
    -- este lugar tengan nivel y puesto — si no, quedarían huérfanas de
    -- coordenadas sin que ningún disparador del lado del HIJO se disparara.
    IF NEW."location_type" = 'drying_rack' AND EXISTS (
      SELECT 1 FROM "core"."location"
      WHERE "parent_location_id" = NEW."id" AND "location_type" = 'drying_bed'
        AND ("rack_level" IS NULL OR "rack_slot" IS NULL)
    ) THEN
      RAISE EXCEPTION 'Un lugar con camas sin nivel ni puesto no puede convertirse en estante';
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
