-- El consumo de campo enlaza al lote del que salio, y descuenta.
--
-- POR QUE. `material_consumption_entry` existe desde antes y anota lo que se
-- gasto en TEXTO LIBRE. Engancharlo es lo que convierte el inventario en algo
-- que sirve: hasta ahora se sabia cuanto entro y cuanto se declaro aparte, pero
-- el consumo real de campo no tocaba las existencias.
--
-- ANULABLE PARA SIEMPRE, y no por comodidad: las filas anteriores a hoy llevan
-- el material en texto libre y no se pueden reasignar sin adivinar. Y obligar a
-- elegir lote convertiria una anotacion de diez segundos en un tramite — y lo
-- que no se anota no existe. Hay una prueba que guarda exactamente eso.
--
-- `batch_label` SE QUEDA: es lo que dice el saco, y sigue valiendo cuando nadie
-- ha dado de alta el lote en el sistema. Las dos cosas conviven porque
-- responden a preguntas distintas.

-- AlterTable
ALTER TABLE "traceability"."material_consumption_entry" ADD COLUMN "consumable_lot_id" UUID;

-- AddForeignKey
ALTER TABLE "traceability"."material_consumption_entry"
  ADD CONSTRAINT "material_consumption_entry_consumable_lot_id_fkey"
  FOREIGN KEY ("consumable_lot_id") REFERENCES "traceability"."consumable_lot"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
