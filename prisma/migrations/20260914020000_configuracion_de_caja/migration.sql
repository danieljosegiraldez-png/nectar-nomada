-- A9 · Anexo B §2.4 — la configuración de la caja, en la COLMENA.
--
-- Lo decide el dueño con sus palabras: «Cambia poco entre visitas, así que se guarda
-- en la colmena y en la inspección sólo se registra la diferencia. Preguntarlo cada
-- vez es coste sin información.»
--
-- **Por qué esta rebanada y no otra:** `frames_per_box` es el DENOMINADOR de
-- «cuadros cubiertos de abeja», que existe desde ADR-117. Sin él, «8 cuadros
-- cubiertos» no se puede comparar entre una caja de 8 y una de 10 — el Anexo pide
-- ese campo precisamente porque es «la medida cuantitativa de fuerza, comparable
-- entre visitas y entre sitios», y sin denominador no lo es.
--
-- `feeder_type` reusa el enum `FeedingMethod` a propósito: son las mismas cosas
-- físicas, y dos enums idénticos serían dos sitios donde añadir el siguiente
-- alimentador. Lo que cambia es el sujeto —lo que la caja LLEVA frente a cómo se
-- dejó una alimentación concreta— y eso lo dice el nombre de la columna.
--
-- Todas anulables: una colmena registrada antes de esto no declara nada, y un valor
-- por defecto afirmaría una caja que nadie miró (ADR-080).

-- AlterTable
ALTER TABLE "apiary"."hive" ADD COLUMN     "brood_boxes" INTEGER,
ADD COLUMN     "supers" INTEGER,
ADD COLUMN     "frames_per_box" INTEGER,
ADD COLUMN     "queen_excluder" BOOLEAN,
ADD COLUMN     "feeder_type" "apiary"."FeedingMethod",
ADD COLUMN     "entrance_reducer" BOOLEAN,
ADD COLUMN     "screened_bottom_board" BOOLEAN;
