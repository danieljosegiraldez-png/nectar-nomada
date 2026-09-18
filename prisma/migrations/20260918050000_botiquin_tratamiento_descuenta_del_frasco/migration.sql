-- Botiquín, Tarea 7: aplicar un tratamiento descuenta del frasco.
--
-- `consumable_lot_id` es opcional para siempre: un tratamiento es un registro
-- legalmente exigido y no puede depender de que alguien elija frasco. ON DELETE
-- RESTRICT, como toda evidencia desde la revisión del 2026-09-01 (migración
-- 20260901100000): no se borra el frasco de un tratamiento aplicado.
--
-- `treatment_lot_expired_at_application` guarda si el frasco estaba vencido el
-- día de la aplicación. Nulo cuando no hay frasco o el frasco no tiene fecha. El
-- CHECK impide la marca sin frasco: una marca de «vencido» sin saber cuál no
-- contesta nada.

-- AlterTable
ALTER TABLE "apiary"."colony_event" ADD COLUMN "consumable_lot_id" UUID,
ADD COLUMN "treatment_lot_expired_at_application" BOOLEAN;

-- AddForeignKey
ALTER TABLE "apiary"."colony_event" ADD CONSTRAINT "colony_event_consumable_lot_id_fkey" FOREIGN KEY ("consumable_lot_id") REFERENCES "traceability"."consumable_lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una marca de vencimiento exige frasco.
ALTER TABLE "apiary"."colony_event" ADD CONSTRAINT "colony_event_marca_de_vencimiento_exige_frasco"
  CHECK ("consumable_lot_id" IS NOT NULL OR "treatment_lot_expired_at_application" IS NULL);
