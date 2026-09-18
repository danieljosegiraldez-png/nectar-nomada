-- Donde se recibio un lote de material, como ancla de RBAC.
--
-- POR QUE. Una pantalla de inventario tiene que filtrar cada lote por el ambito
-- de quien mira, igual que la de equipos filtra cada equipo. Y no podia: el
-- material se creaba con un sitio para juzgar el permiso, pero NO SE GUARDABA.
-- Sin ancla, la lista no tiene contra que filtrar. Lo encontre al escribir la
-- pantalla, no antes, y es un hueco mio de la Tarea 2.
--
-- Mismo papel que `biochar_batch.produced_at_location_id`, que el esquema llama
-- literalmente «el ancla de RBAC».
--
-- ANULABLE: los lotes anteriores no lo tienen. Uno sin ubicacion cae al ambito
-- de plataforma, asi que solo lo ve quien manda en toda la plataforma. Que lo
-- desconocido se cierre en vez de abrirse es a proposito.

-- AlterTable
ALTER TABLE "traceability"."consumable_lot" ADD COLUMN "location_id" UUID;

-- AddForeignKey
ALTER TABLE "traceability"."consumable_lot" ADD CONSTRAINT "consumable_lot_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
