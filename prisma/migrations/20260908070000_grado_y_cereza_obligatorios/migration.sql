-- El grado de proceso y el estado de la cereza pasan a ser OBLIGATORIOS.
--
-- POR QUÉ. Nacieron anulables el día anterior, con el argumento de que «un lote
-- viejo puede no tenerlo». Daniel lo corrigió: no se abre un proceso sin decir
-- qué se le está haciendo al café y en qué estado entra, igual que no se abre
-- sin decir a qué humedad se va a almacenar. Un café es natural, lavado o honey;
-- no es «ninguno».
--
-- SE PUEDE EXIGIR SIN MIGRAR UN SOLO DATO, y por eso se cuenta antes: producción
-- tenía CERO procesos —`lot_process` nació el 2026-09-07— así que no hay ninguna
-- fila a la que habría que inventarle un grado. Si algún día esto deja de ser
-- cierto, la migración ABORTA aquí con el número, en vez de fallar a medias con
-- un error de restricción que no dice qué pasó.
--
-- `process_recipe_version_id` NO se toca: sigue anulable a propósito. Una receta
-- es un procedimiento estandarizado y se puede procesar sin una; el grado no es
-- opcional.

DO $$
DECLARE huerfanas INTEGER;
BEGIN
  SELECT count(*) INTO huerfanas FROM "traceability"."lot_process"
  WHERE "process_grade_value_id" IS NULL OR "cherry_state_value_id" IS NULL;
  IF huerfanas > 0 THEN
    RAISE EXCEPTION 'lot_process: % fila(s) sin grado de proceso o sin estado de cereza. Declararlos es una decisión humana, no algo que esta migración pueda inventar.', huerfanas;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "traceability"."lot_process" ALTER COLUMN "process_grade_value_id" SET NOT NULL;
ALTER TABLE "traceability"."lot_process" ALTER COLUMN "cherry_state_value_id" SET NOT NULL;
