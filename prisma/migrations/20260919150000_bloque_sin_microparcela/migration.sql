-- Decisión de Daniel, 2026-09-19: una MICROPARCELA es la Location `micro_plot`
-- del spec fincas y parcelas, no un tipo de PlotBlock. «microparcela» sale de
-- `PlotBlockType` (spec `2026-09-18-vistas-de-finca-y-parcela-design.md` §5),
-- que se queda con los dos tipos que sí describen una ZONA dentro de una
-- parcela: trampa y experimental.
--
-- No se edita la migración `20260918160000_bloques_con_tipo` que creó el enum:
-- ya está aplicada en la base compartida. Los bloques existentes con
-- `block_type = 'microparcela'` pasan a NULL — un tipo desconocido, ADR-080,
-- que la UI ya sabe mostrar ("sin tipo") y ofrece asignar de nuevo con
-- `AsignarTipoDeBloqueForm`.
UPDATE "traceability"."plot_block" SET "block_type" = NULL WHERE "block_type" = 'microparcela';

ALTER TYPE "traceability"."PlotBlockType" RENAME TO "PlotBlockType_old";

CREATE TYPE "traceability"."PlotBlockType" AS ENUM ('trampa', 'experimental');

ALTER TABLE "traceability"."plot_block"
  ALTER COLUMN "block_type" TYPE "traceability"."PlotBlockType"
  USING ("block_type"::text::"traceability"."PlotBlockType");

DROP TYPE "traceability"."PlotBlockType_old";
