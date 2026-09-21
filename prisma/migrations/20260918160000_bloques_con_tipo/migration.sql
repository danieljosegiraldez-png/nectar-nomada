-- F2 §3 extendido (spec `2026-09-18-vistas-de-finca-y-parcela-design.md` §5). «Bloque»
-- gana tipo: microparcela, trampa o experimental. ADR-080 — los bloques que ya existen
-- quedan con `block_type` NULL, nunca con uno supuesto; por eso la columna nace anulable
-- y SIN valor por defecto.
CREATE TYPE "traceability"."PlotBlockType" AS ENUM ('microparcela', 'trampa', 'experimental');

ALTER TABLE "traceability"."plot_block"
  ADD COLUMN "block_type" "traceability"."PlotBlockType",
  ADD COLUMN "description" TEXT;
