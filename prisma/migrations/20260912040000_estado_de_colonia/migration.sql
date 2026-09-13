-- A9 · Anexo B §2.2 — «Estado de la colonia, nuevo, por protocolo».
--
-- Siete campos que el dueño pide con su motivo al lado y que NO existían. El
-- vocabulario no se inventa: sale de `protocolos/apiario-campo-v1.json`, que él
-- escribió, y que este archivo NO modifica — su propia cabecera lo prohíbe
-- («cambiar esto después no es editar aquí: es crear una versión 2»).
--
-- `storesLevel` NO se borra, aunque lo reemplacen dos columnas. Medido el
-- 2026-09-12 sobre la copia local: 1 inspección en total y ni un valor en esa
-- columna. Pero esa copia viene de un respaldo y producción no se mide sin
-- tocarla, así que se deja: borrar una columna es el único movimiento que una
-- migración no puede deshacer. El formulario deja de escribirla.
--
-- Todas las columnas son NULLABLE a propósito. Una inspección rápida que sólo
-- comprueba si la caja sigue viva es legítima, y un valor por defecto afirmaría
-- algo que nadie observó (ADR-080). `brood_stages` vacío y nulo significan lo
-- mismo aquí: no se registró.
--
-- Lo que esta migración NO trae, y es deliberado: las seis líneas sobre
-- `traceability.lot_process`, `drying_run` y `fermentation_run` que
-- `migrate diff` propone en este repositorio desde antes de esta rama. Son
-- deriva previa entre el esquema y las migraciones, ajena a este cambio;
-- arrastrarlas aquí las atribuiría a él.

-- CreateEnum
CREATE TYPE "apiary"."ColonyPopulation" AS ENUM ('baja', 'normal', 'apinada');

-- CreateEnum
CREATE TYPE "apiary"."BroodStage" AS ENUM ('huevo', 'larva', 'operculada', 'pupa');

-- CreateEnum
CREATE TYPE "apiary"."QueenCellKind" AS ENUM ('no_hay', 'emergencia', 'enjambrazon', 'reemplazo');

-- CreateEnum
-- Tres valores, no los cuatro del Anexo: «junto a la cría» es un SITIO y vive en
-- su propia columna booleana. Decisión del dueño, 2026-09-12, ADR-117.
CREATE TYPE "apiary"."StoresLevel" AS ENUM ('alta', 'media', 'baja');

-- AlterTable
ALTER TABLE "apiary"."inspection" ADD COLUMN     "population" "apiary"."ColonyPopulation",
ADD COLUMN     "bee_covered_frames" INTEGER,
ADD COLUMN     "brood_stages" "apiary"."BroodStage"[],
ADD COLUMN     "queen_cell_kind" "apiary"."QueenCellKind",
ADD COLUMN     "queen_cell_count" INTEGER,
ADD COLUMN     "honey_stores_level" "apiary"."StoresLevel",
ADD COLUMN     "honey_next_to_brood" BOOLEAN,
ADD COLUMN     "pollen_stores_level" "apiary"."StoresLevel",
ADD COLUMN     "pollen_next_to_brood" BOOLEAN,
ADD COLUMN     "drone_brood_present" BOOLEAN;
