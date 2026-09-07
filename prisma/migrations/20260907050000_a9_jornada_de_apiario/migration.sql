-- A9.1 — la jornada de campo agrupa también el trabajo de apiario, y sabe cerrarse.
--
-- Aditiva entera: tres FK anulables en `field_event`, tres columnas en
-- `field_session` y un enum. Ninguna fila existente cambia de significado —
-- las sesiones que ya hay quedan en `draft`, que es lo que eran.
--
-- Las FK van con ON DELETE SET NULL, igual que las seis de café que ya
-- estaban: borrar una inspección no debe borrar la jornada que la agrupó.

-- CreateEnum
CREATE TYPE "traceability"."FieldSessionStatus" AS ENUM ('draft', 'completed', 'locked');

-- AlterTable
ALTER TABLE "traceability"."field_event" ADD COLUMN     "apiary_harvest_event_id" UUID,
ADD COLUMN     "colony_event_id" UUID,
ADD COLUMN     "inspection_id" UUID;

-- AlterTable
ALTER TABLE "traceability"."field_session" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "edit_window_expires_at" TIMESTAMP(3),
ADD COLUMN     "status" "traceability"."FieldSessionStatus" NOT NULL DEFAULT 'draft';

-- CreateIndex
CREATE INDEX "field_event_inspection_id_idx" ON "traceability"."field_event"("inspection_id");

-- CreateIndex
CREATE INDEX "field_event_colony_event_id_idx" ON "traceability"."field_event"("colony_event_id");

-- CreateIndex
CREATE INDEX "field_event_apiary_harvest_event_id_idx" ON "traceability"."field_event"("apiary_harvest_event_id");

-- AddForeignKey
ALTER TABLE "traceability"."field_event" ADD CONSTRAINT "field_event_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "apiary"."inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."field_event" ADD CONSTRAINT "field_event_colony_event_id_fkey" FOREIGN KEY ("colony_event_id") REFERENCES "apiary"."colony_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."field_event" ADD CONSTRAINT "field_event_apiary_harvest_event_id_fkey" FOREIGN KEY ("apiary_harvest_event_id") REFERENCES "apiary"."apiary_harvest_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

