-- Las tres reglas de la rejilla que vivían SÓLO en TypeScript.
--
-- Dos revisiones independientes las midieron el 2026-10-02 sobre las tareas 4 a 7
-- del plan `2026-10-01-rejilla-y-rangos`, y las tres tienen la misma forma que
-- `CLAUDE.md` describe: «una restricción que vive en TypeScript no existe para la
-- base — un importador, una reparación operativa o SQL directo se la saltan».
--
--   1. El rango de un bloque podía NO caber en la rejilla. Un `INSERT` directo con
--      99x99 entraba. El §5.1 del diseño lo pide, y la tarea 5 se apoyaba en una
--      garantía inexistente.
--   2. El rango de un bloque podía caer FUERA de su microparcela. Eso no lo
--      impedía nada, ni la base ni el servicio: un bloque pertenecía
--      administrativamente a un suelo y ocupaba otro.
--   3. `exigir_trampas_sin_solape` comparaba `b2."location_id" = mi_parcela`, y esa
--      variable guarda el `location_id` del BLOQUE — que para un bloque en
--      microparcela es la microparcela. **El nombre de la variable delata la
--      intención.** D7 no lleva calificativo de sitio: «dos de trampa no se
--      solapan entre sí», y D3 dice que la numeración es UNA, la de la parcela.
--      Dos trampas en microparcelas hermanas comparten rejilla y entraban, con un
--      aviso idéntico al benigno de un ensayo sobre una trampa. Un estado que D7
--      prohíbe se leía como aprobado.
--
-- Y una cuarta, de la misma familia: cambiar el TIPO de un bloque a `trampa`
-- después, cuando su rango ya se solapaba con una trampa, no volvía a comprobar
-- nada. El disparador estaba sólo en `plot_block_range`.
--
-- **Ninguno de estos cuatro puede abortar esta migración.** Son disparadores
-- `BEFORE INSERT OR UPDATE`, así que validan la fila que entra o cambia, no las
-- que ya están — a diferencia de un `ADD CONSTRAINT CHECK`, que valida el pasado
-- al aplicarse. Lo que sí queda dicho: una fila existente que las incumpla se
-- queda, y fallará la próxima vez que alguien la actualice.

-- ---------------------------------------------------------------------------
-- La parcela que pone la numeración, en UN solo sitio.
--
-- Los cuatro disparadores de abajo la necesitan, y escribirla cuatro veces es
-- garantizar que deriven. Es la misma regla que `rejillaDelBloque` en
-- `lib/traceability/plotBlocks.ts`, a propósito: un bloque cuelga de la parcela o
-- de una microparcela suya, y la rejilla vive en la parcela (D3).
--
-- Devuelve el padre AUNQUE el padre tampoco tenga rejilla — igual que el
-- servicio. Quien pregunte si hay rejilla lo pregunta después; esta función
-- contesta «de quién es la numeración», no «existe».
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "core"."raiz_de_la_numeracion"(sitio UUID)
RETURNS UUID AS $$
DECLARE
  l RECORD;
BEGIN
  SELECT "id", "row_count", "parent_location_id" INTO l
    FROM "core"."location" WHERE "id" = sitio;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF l."row_count" IS NOT NULL THEN RETURN l."id"; END IF;
  RETURN l."parent_location_id";
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- 1. El rango de un bloque cabe en la rejilla de su parcela.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "traceability"."exigir_rango_de_bloque_en_la_rejilla"()
RETURNS TRIGGER AS $$
DECLARE
  raiz UUID;
  p RECORD;
BEGIN
  SELECT "core"."raiz_de_la_numeracion"(b."location_id") INTO raiz
    FROM "traceability"."plot_block" b WHERE b."id" = NEW."plot_block_id";
  IF raiz IS NULL THEN
    RAISE EXCEPTION 'El bloque no cuelga de ninguna parcela: no hay rejilla en la que quepa su rango';
  END IF;
  SELECT "row_count", "plants_per_row" INTO p FROM "core"."location" WHERE "id" = raiz;
  IF p."row_count" IS NULL THEN
    RAISE EXCEPTION 'La parcela no tiene rejilla: sin rejilla no hay rango de bloque que le quepa';
  END IF;
  IF NEW."row_to" > p."row_count" OR NEW."plant_to" > p."plants_per_row" THEN
    RAISE EXCEPTION 'El rango del bloque no cabe en la rejilla de la parcela (% hileras x % plantas)',
      p."row_count", p."plants_per_row";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plot_block_range_exigir_rango_en_la_rejilla"
  BEFORE INSERT OR UPDATE ON "traceability"."plot_block_range"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_rango_de_bloque_en_la_rejilla"();

-- ---------------------------------------------------------------------------
-- 2. El rango de un bloque no se sale de su microparcela.
--
-- Sólo cuando la microparcela DECLARA su rango: sin rango no hay límite que
-- exigir, y eso es deliberado (el rango de la microparcela es opcional, D3).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "traceability"."exigir_rango_de_bloque_en_su_microparcela"()
RETURNS TRIGGER AS $$
DECLARE
  s RECORD;
BEGIN
  SELECT l."range_row_from" AS rf, l."range_row_to" AS rt,
         l."range_plant_from" AS pf, l."range_plant_to" AS pt, l."name" AS nombre
    INTO s
    FROM "traceability"."plot_block" b
    JOIN "core"."location" l ON l."id" = b."location_id"
   WHERE b."id" = NEW."plot_block_id";
  IF NOT FOUND OR s.rf IS NULL THEN RETURN NEW; END IF;
  IF NEW."row_from" < s.rf OR NEW."row_to" > s.rt
     OR NEW."plant_from" < s.pf OR NEW."plant_to" > s.pt THEN
    RAISE EXCEPTION 'El rango del bloque se sale de la microparcela %, que ocupa de la hilera % a la % y de la planta % a la %',
      s.nombre, s.rf, s.rt, s.pf, s.pt;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plot_block_range_exigir_rango_en_su_microparcela"
  BEFORE INSERT OR UPDATE ON "traceability"."plot_block_range"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_rango_de_bloque_en_su_microparcela"();

-- ---------------------------------------------------------------------------
-- 3. D7 con el alcance que D7 dice: la NUMERACIÓN, no el sitio.
--
-- Se reemplaza la función; el disparador que la llama ya existe y no se toca.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "traceability"."exigir_trampas_sin_solape"()
RETURNS TRIGGER AS $$
DECLARE
  mi_tipo "traceability"."PlotBlockType";
  mi_sitio UUID;
  mi_raiz UUID;
  otro TEXT;
BEGIN
  SELECT b."block_type", b."location_id" INTO mi_tipo, mi_sitio
    FROM "traceability"."plot_block" b WHERE b."id" = NEW."plot_block_id";
  IF mi_tipo IS DISTINCT FROM 'trampa' THEN RETURN NEW; END IF;
  mi_raiz := "core"."raiz_de_la_numeracion"(mi_sitio);

  SELECT b2."name" INTO otro
    FROM "traceability"."plot_block_range" r2
    JOIN "traceability"."plot_block" b2 ON b2."id" = r2."plot_block_id"
   WHERE b2."block_type" = 'trampa'
     AND b2."id" <> NEW."plot_block_id"
     AND "core"."raiz_de_la_numeracion"(b2."location_id") = mi_raiz
     AND int4range(r2."row_from", r2."row_to", '[]') && int4range(NEW."row_from", NEW."row_to", '[]')
     AND int4range(r2."plant_from", r2."plant_to", '[]') && int4range(NEW."plant_from", NEW."plant_to", '[]')
   LIMIT 1;
  IF otro IS NOT NULL THEN
    RAISE EXCEPTION 'Dos bloques de trampa no cubren las mismas celdas: se solapa con %', otro;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 4. Y marcar como trampa un bloque que YA se solapa con una trampa.
--
-- El disparador de arriba vive en `plot_block_range`, así que cambiar el tipo del
-- bloque después no volvía a comprobar nada: un bloque sin tipo con el mismo rango
-- que una trampa se guardaba con aviso —D7 dice que sin tipo no bloquea— y
-- `AsignarTipoDeBloqueForm`, que ofrece justo esos bloques, lo pasaba a «trampa»
-- sin rechazo ni aviso.
--
-- Sólo mira la TRANSICIÓN a trampa: si ya lo era, sus rangos ya pasaron por el
-- disparador de arriba.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "traceability"."exigir_trampa_nueva_sin_solape"()
RETURNS TRIGGER AS $$
DECLARE
  mi_raiz UUID;
  otro TEXT;
BEGIN
  IF NEW."block_type" IS DISTINCT FROM 'trampa' THEN RETURN NEW; END IF;
  IF OLD."block_type" IS NOT DISTINCT FROM 'trampa' THEN RETURN NEW; END IF;
  mi_raiz := "core"."raiz_de_la_numeracion"(NEW."location_id");

  SELECT b2."name" INTO otro
    FROM "traceability"."plot_block_range" r
    JOIN "traceability"."plot_block_range" r2
      ON int4range(r."row_from", r."row_to", '[]') && int4range(r2."row_from", r2."row_to", '[]')
     AND int4range(r."plant_from", r."plant_to", '[]') && int4range(r2."plant_from", r2."plant_to", '[]')
    JOIN "traceability"."plot_block" b2 ON b2."id" = r2."plot_block_id"
   WHERE r."plot_block_id" = NEW."id"
     AND b2."block_type" = 'trampa'
     AND b2."id" <> NEW."id"
     AND "core"."raiz_de_la_numeracion"(b2."location_id") = mi_raiz
   LIMIT 1;
  IF otro IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede marcar como trampa: sus celdas se solapan con la trampa %', otro;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plot_block_exigir_trampa_nueva_sin_solape"
  BEFORE UPDATE OF "block_type" ON "traceability"."plot_block"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_trampa_nueva_sin_solape"();
