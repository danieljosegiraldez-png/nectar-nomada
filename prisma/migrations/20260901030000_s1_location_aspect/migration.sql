-- S1 — orientación de la ladera (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2).
--
-- Aditiva por completo: un tipo nuevo y una columna nullable. Sin backfill y
-- sin adivinar: los ocho lotes existentes quedan con `aspect` NULL, que es la
-- verdad — nadie ha registrado su orientación todavía. Deducirla de la prosa
-- de `slope_description` sería convertir una lectura en un hecho (ADR-080),
-- así que no se toca.
--
-- Por qué enumerada, cuando `slope_description` y `soil_type` son texto libre:
-- esas dos lo son porque nadie dio una lista de valores. La rosa de los
-- vientos no se inventa, y el uso que le da el marco es comparativo — «cuatro
-- bloques que abarquen orientaciones distintas» (Paso 3) sólo se responde si
-- el valor agrupa.
CREATE TYPE "core"."Aspect" AS ENUM (
  'north', 'northeast', 'east', 'southeast',
  'south', 'southwest', 'west', 'northwest',
  -- Sin pendiente apreciable, y varias orientaciones en el mismo bloque: dos
  -- hechos distintos, ninguno de los cuales es un punto cardinal.
  'flat', 'variable'
);

ALTER TABLE "core"."location"
  ADD COLUMN "aspect" "core"."Aspect";
