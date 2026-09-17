-- Dos decisiones del dueno, 2026-09-17.
--
-- 1) LA EÑE. `apiñada` es su ortografia y la que su protocolo ya usaba; el enum
-- decia `apinada`, y NADIE traducia entre los dos. El comentario del esquema
-- justificaba la ausencia de la eñe diciendo que «un identificador de enum no la
-- admite»: ES FALSO, comprobado con `prisma validate`. Esa suposicion escrita y
-- nunca medida es la razon de la divergencia.
--
-- SE ESCRIBE A MANO Y NO CON LO QUE GENERO PRISMA. Prisma propuso un
-- INTERCAMBIO DE TIPO --crear `ColonyPopulation_new` y castear
-- `population::text::ColonyPopulation_new`--, y ese cast REVIENTA para cualquier
-- fila que valga 'apinada'. En la base local hay 0 (medido: 2 inspecciones, 0
-- con ese valor), pero la de produccion no se puede leer desde aqui.
-- `RENAME VALUE` preserva los datos por definicion: renombra la etiqueta, no
-- reescribe las filas.
ALTER TYPE "apiary"."ColonyPopulation" RENAME VALUE 'apinada' TO 'apiñada';

-- 2) EL VOCABULARIO DE ALIMENTACION: «mis cinco mas los jarabes».
--
-- ADR-148 puso los cinco que el dueno dicto y dejo el protocolo con los suyos de
-- antes; eran dos vocabularios para la misma pregunta. Ahora es uno.
--
-- `sustituto_polen` y `torta` NO son jarabes --son alimentos proteicos-- y se
-- quedan porque ya estaban en SU protocolo: quitarlos seria una perdida de
-- capacidad que nadie pidio.
--
-- Cuatro ADD VALUE en una migracion: aditivo, no convierte nada, y Postgres
-- moderno lo admite en una sola (el aviso de Prisma sobre PG<=11 no aplica).
ALTER TYPE "apiary"."FeedingMaterial" ADD VALUE 'jarabe_1_1';
ALTER TYPE "apiary"."FeedingMaterial" ADD VALUE 'jarabe_2_1';
ALTER TYPE "apiary"."FeedingMaterial" ADD VALUE 'sustituto_polen';
ALTER TYPE "apiary"."FeedingMaterial" ADD VALUE 'torta';
