-- El tablero limita dónde se puede situar un plantón.
--
-- **El guardia existía en UN SOLO SENTIDO.** `location_exigir_rejilla_sin_huerfanos`
-- impide encoger la rejilla por debajo de una planta existente —nombra «una planta
-- en la hilera 9, planta 12»— pero no había ningún disparador sobre
-- `traceability.specimen`. Medido el 2026-10-02: 0, con el control de que el mismo
-- archivo de migración nombra `plot_block` 15 veces. Así que un plantón se podía
-- crear en la hilera 99 de un lote de 10 hileras y nadie decía nada.
--
-- **Hoy eso sólo se alcanza por SQL directo:** 0 archivos de `app/` y 0 scripts
-- nombran `grid_row`. Esto es la PRECONDICIÓN de las pantallas que van a escribir
-- esas coordenadas, no el arreglo de un fallo vivo — y tiene que existir antes que
-- ellas, porque un guardia añadido después hereda las filas malas que ya entraron.
--
-- **No puede abortar esta migración.** Es `BEFORE`, así que valida la fila que entra
-- o cambia, no las que ya están. Una fila existente que lo incumpla se queda, y
-- fallará la próxima vez que alguien la actualice.
--
-- **No exige que los dos números estén puestos, y no es un olvido.**
-- `lib/traceability/jornadasDeCosecha.ts` imprime `${gridRow}-${gridPosition ?? "?"}`:
-- media coordenada es un caso que el repositorio ya tolera a propósito. Cada número
-- se valida contra su propio límite, por separado. La regla de «los dos o ninguno»
-- habría ampliado el diseño y roto ese código.
CREATE OR REPLACE FUNCTION "traceability"."exigir_planton_en_la_rejilla"()
RETURNS TRIGGER AS $$
DECLARE
  raiz UUID;
  p RECORD;
BEGIN
  -- Sin ninguna coordenada no hay nada que comprobar: un plantón puede no estar situado.
  IF NEW."grid_row" IS NULL AND NEW."grid_position" IS NULL THEN RETURN NEW; END IF;

  -- La parcela que pone la numeración, en la misma función que usan los otros cuatro
  -- disparadores: un plantón cuelga de la parcela o de una microparcela suya, y la
  -- rejilla vive en la parcela (D3).
  raiz := "core"."raiz_de_la_numeracion"(NEW."location_id");
  IF raiz IS NULL THEN
    RAISE EXCEPTION 'El plantón no cuelga de ninguna parcela: no hay rejilla donde situarlo';
  END IF;

  SELECT "row_count", "plants_per_row" INTO p FROM "core"."location" WHERE "id" = raiz;
  IF p."row_count" IS NULL THEN
    RAISE EXCEPTION 'La parcela no tiene rejilla: sin rejilla no se puede situar un plantón en una celda';
  END IF;

  IF (NEW."grid_row" IS NOT NULL AND (NEW."grid_row" < 1 OR NEW."grid_row" > p."row_count"))
     OR (NEW."grid_position" IS NOT NULL
         AND (NEW."grid_position" < 1 OR NEW."grid_position" > p."plants_per_row")) THEN
    RAISE EXCEPTION 'La celda (hilera %, planta %) no existe en la rejilla de la parcela (% hileras x % plantas)',
      COALESCE(NEW."grid_row"::TEXT, 'sin decir'),
      COALESCE(NEW."grid_position"::TEXT, 'sin decir'),
      p."row_count", p."plants_per_row";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- `UPDATE OF location_id` también: mover el plantón a otra ubicación le cambia la
-- parcela que pone la numeración, así que sus coordenadas vuelven a comprobarse.
CREATE TRIGGER "specimen_exigir_planton_en_la_rejilla"
  BEFORE INSERT OR UPDATE OF "grid_row", "grid_position", "location_id"
  ON "traceability"."specimen"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_planton_en_la_rejilla"();
