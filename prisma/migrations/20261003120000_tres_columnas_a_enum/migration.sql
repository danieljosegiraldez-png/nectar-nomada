-- Tres columnas de `apiary.inspection` pasan a `enum`, y «no se buscó» deja de ser `null`.
-- `PENDING_IMPLEMENTATIONS/010`, requisito 4.
--
-- **El defecto que cierra.** El protocolo del dueño pregunta la reina con TRES respuestas
-- —`vista`, `no_vista`, `no_se_busco`— y la columna era `BOOLEAN`, que tiene dos más el nulo. Así
-- que «miré la pregunta y decidí no buscarla» aterrizaba en el mismo `NULL` que «nadie contestó».
-- Y `brood_pattern_note` / `temperament_note` eran `TEXT`, así que cualquier grafía entraba y nada
-- las podía agrupar, aunque el protocolo declarase sus cinco y sus tres valores desde A9.4.

CREATE TYPE "apiary"."QueenSighting" AS ENUM ('vista', 'no_vista', 'no_se_busco');
CREATE TYPE "apiary"."BroodPattern" AS ENUM ('compacto', 'salteado', 'apretado', 'promedio', 'nulo');
CREATE TYPE "apiary"."Temperament" AS ENUM ('mansa', 'normal', 'defensiva');

-- **La conversión va explícita aunque hoy no haya ninguna fila que convertir.** Medido el
-- 2026-10-03 en solo-lectura sobre la copia restaurada: `apiary.inspection` tiene **0** filas y las
-- tres columnas **0** valores no nulos. Pero producción puede ganarlas entre este commit y su
-- fusión, y Postgres **no** convierte `boolean` a `enum` por su cuenta: sin `USING`, esta migración
-- falla en cuanto exista una fila.
--
-- `true` era «vista» y `false` era «no vista». **Un `NULL` se queda `NULL`**: con la columna
-- booleana «no se buscó» no se podía decir, así que convertirlo a `no_se_busco` inventaría un hecho
-- que nadie registró — que es exactamente lo que este cambio existe para impedir.
ALTER TABLE "apiary"."inspection"
  ALTER COLUMN "queen_sighted" TYPE "apiary"."QueenSighting"
  USING CASE "queen_sighted"
    WHEN true THEN 'vista'::"apiary"."QueenSighting"
    WHEN false THEN 'no_vista'::"apiary"."QueenSighting"
    ELSE NULL
  END;

-- Las dos de texto se renombran **y** cambian de tipo. Pierden el sufijo `Note` porque, una vez
-- cerrado el vocabulario, «nota» pasaría a mentir: una nota es texto libre.
--
-- El texto que hubiera sólo se convierte si casa EXACTAMENTE un valor del enum; cualquier otra cosa
-- se va a `NULL` en vez de romper la migración. Es deliberado y es la lectura honesta: un texto
-- libre que no es ninguno de los cinco valores no «es» ninguno de ellos, y adivinar cuál sería
-- inventar. Con 0 filas no se pierde nada hoy; si mañana hubiera texto que no casa, lo correcto es
-- medirlo ANTES de migrar y no dejar que una migración decida por nadie.
ALTER TABLE "apiary"."inspection" RENAME COLUMN "brood_pattern_note" TO "brood_pattern";
ALTER TABLE "apiary"."inspection"
  ALTER COLUMN "brood_pattern" TYPE "apiary"."BroodPattern"
  USING CASE
    WHEN "brood_pattern" IN ('compacto', 'salteado', 'apretado', 'promedio', 'nulo')
      THEN "brood_pattern"::"apiary"."BroodPattern"
    ELSE NULL
  END;

ALTER TABLE "apiary"."inspection" RENAME COLUMN "temperament_note" TO "temperament";
ALTER TABLE "apiary"."inspection"
  ALTER COLUMN "temperament" TYPE "apiary"."Temperament"
  USING CASE
    WHEN "temperament" IN ('mansa', 'normal', 'defensiva')
      THEN "temperament"::"apiary"."Temperament"
    ELSE NULL
  END;
