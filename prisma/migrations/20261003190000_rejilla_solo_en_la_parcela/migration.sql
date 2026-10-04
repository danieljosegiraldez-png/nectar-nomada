-- D3 del diseño del 2026-10-01: «una sola numeración, la de la parcela».
--
-- **Por qué en la base y no sólo en el servicio.** `updateLocationAttributes` ya
-- rechaza ponerle rejilla a una microparcela, y ésa es la puerta por la que pasa
-- la aplicación. Pero el servicio mira el padre EN EL MOMENTO de escribir la
-- rejilla, así que hay un hueco que estructuralmente no puede ver: si una parcela
-- legítima de primer nivel declara su rejilla y DESPUÉS alguien la re-cuelga de
-- otra parcela —o retipa a su padre de `site` a `plot`—, pasa a ser microparcela
-- con rejilla **sin que ninguna de las cuatro columnas se toque**. Un importador o
-- un SQL directo tampoco pasan por TypeScript.
--
-- Medido el 2026-10-03 antes de escribir esto, contra una base con las 200
-- migraciones aplicadas, no leyendo las migraciones: de los CHECK sobre
-- `core.location`, DOS nombran la rejilla y CERO mencionan `parent` o
-- `location_type`; de los 5 disparadores, los 2 que miran la rejilla no mencionan
-- `plot` y los que leen al padre no miran la rejilla. Control positivo:
-- `exigir_arbol_de_estante` sí lee `parent_location_id`, o sea que el patrón ya
-- existe en esta misma base.
--
-- **Tiene que ser disparador, no CHECK.** PostgreSQL no admite subconsultas en un
-- CHECK, así que una restricción de fila no puede consultar el tipo de su padre.
-- Es el mismo patrón —y las mismas palabras— que `location_bodega_padre`
-- (20260919200500) y `exigir_arbol_de_estante` (20260918190500).
--
-- Producción tenía 2 microparcelas y 0 con rejilla cuando esto se escribió, así que
-- no hay filas que estos disparadores fueran a rechazar. Y como son disparadores y
-- no `ADD CONSTRAINT`, tampoco validan lo existente: lo que hacen es cerrar la
-- puerta a partir de ahora.

-- ── Del lado del HIJO: nadie pone rejilla colgando de una parcela ──
--
-- Vaciarla sigue permitido a propósito, igual que en el servicio: pueden existir
-- filas de antes de la regla, y bloquear el camino de vuelta las dejaría
-- atrapadas. Por eso la primera línea sale cuando `row_count` queda nulo.
CREATE FUNCTION "core"."exigir_rejilla_solo_en_parcela"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tipo_padre text;
BEGIN
  IF NEW."row_count" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."parent_location_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "location_type"::text INTO tipo_padre FROM "core"."location" WHERE "id" = NEW."parent_location_id";
  IF tipo_padre = 'plot' THEN
    RAISE EXCEPTION 'Una microparcela no se numera aparte: la numeracion es la de su parcela';
  END IF;
  RETURN NEW;
END;
$$;

-- `parent_location_id` y `location_type` están en la lista a propósito: re-colgar
-- es justo el hueco que el servicio no ve.
CREATE TRIGGER "location_rejilla_solo_en_parcela"
  BEFORE INSERT OR UPDATE OF "grid_origin", "row_count", "plants_per_row", "row_spacing_meters", "parent_location_id", "location_type" ON "core"."location"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_rejilla_solo_en_parcela"();

-- ── Del lado del PADRE: un sitio no se vuelve parcela por debajo de hijas numeradas ──
--
-- La otra mitad, igual que `exigir_arbol_de_estante` tiene la suya: el disparador
-- del hijo no se entera cuando quien cambia es el padre.
CREATE FUNCTION "core"."exigir_rejilla_al_retipar_el_padre"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  culpable text;
BEGIN
  IF NEW."location_type"::text <> 'plot' THEN
    RETURN NEW;
  END IF;
  IF OLD."location_type"::text = 'plot' THEN
    RETURN NEW;
  END IF;
  SELECT h."name" INTO culpable
    FROM "core"."location" h
   WHERE h."parent_location_id" = NEW."id" AND h."row_count" IS NOT NULL
   LIMIT 1;
  IF culpable IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede volver parcela: su hija % ya tiene rejilla propia', culpable;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "location_rejilla_al_retipar_el_padre"
  BEFORE UPDATE OF "location_type" ON "core"."location"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_rejilla_al_retipar_el_padre"();
