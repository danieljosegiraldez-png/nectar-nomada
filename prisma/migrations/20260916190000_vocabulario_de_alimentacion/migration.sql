-- Con que se alimento, del vocabulario del dueno, en vez de texto libre.
--
-- POR QUE. Daniel, en campo el 2026-09-16: "yo quiero que todos los campos, lo
-- mas que se pueda, no sea campo libre de texto libre, que sean variables como
-- le alimente con azucar morena o azucar blanca o con melaza o con miel de abeja
-- miel de cana". Los cinco valores son suyos, literales. No se anadio ninguno
-- mas: un vocabulario con valores que nadie usa ensena a elegir "otro".
--
-- QUE NO HACE, y es la parte que importa: NO convierte `feeding_material`. Esa
-- columna de texto se queda, y pasa a ser dos cosas a la vez -- el "cual" de
-- `otro`, y lo que ya se hubiera escrito antes del vocabulario. Convertirla
-- exigiria traducir lo ya guardado en produccion, y esa base no se puede leer
-- desde aqui.
--
-- Anadir un tipo y una columna anulable es aditivo: ninguna fila existente
-- cambia, ninguna consulta de hoy devuelve algo distinto, y nada bloquea.

-- CreateEnum
CREATE TYPE "apiary"."FeedingMaterial" AS ENUM ('azucar_morena', 'azucar_blanca', 'melaza', 'miel_de_abeja', 'miel_de_cana', 'otro');

-- AlterTable
ALTER TABLE "apiary"."colony_event" ADD COLUMN     "feeding_material_kind" "apiary"."FeedingMaterial";

