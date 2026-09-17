-- Tablero de parcela: «entró en producción» como evento de siembra.
-- Precedente de ADD VALUE en una migración: 20260915210000_marco_de_siembra_y_cohorte_planificada.
ALTER TYPE "traceability"."PlantingEventType" ADD VALUE 'entered_production';

-- HarvestWindowPrecision vive en el esquema `core`, no en `traceability`.
ALTER TABLE "traceability"."planting_event"
  ADD COLUMN "occurred_precision" "core"."HarvestWindowPrecision";
