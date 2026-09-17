-- El consumo de material puede colgar de una JORNADA DE CAMPO.
--
-- POR QUE. Daniel, 2026-09-17, contando una visita real al apiario: uniforme de
-- apicultor, ahumador, aserrin y hojas para el ahumador, encendedor, una lija de
-- ebanisteria y diez reductores de piquera. Hasta hoy un consumo solo podia
-- colgar de una fermentacion, un secado o una UBICACION — asi que el sistema
-- podia decir «se gasto aserrin en el Apiario Finca Rosina» y no «en la visita
-- del martes».
--
-- Y la visita es la unidad en la que se trabaja: una `field_session` tiene su
-- operario, su hora de inicio, su ventana de edicion y sus cuentas de colmenas.
-- Lo gastado forma parte de ella igual que los jornales.
--
-- `field_session` ya existia y NO tenia relacion con los consumos. Esto la
-- anade por la puerta que ya estaba: una variante mas del padre discriminado de
-- `MaterialConsumptionParent`, cuyo `switch` es exhaustivo — anadir la variante
-- OBLIGA a tratarla, y el typecheck lo exige.
--
-- Anulable: los consumos que cuelgan de una corrida o de un sitio siguen
-- colgando de ahi. Un consumo tiene UN padre, no dos: con dos se contaria dos
-- veces el dia que alguien sume por sitio y por jornada.
--
-- Una columna anulable con su clave foranea: aditivo.

-- AlterTable
ALTER TABLE "traceability"."material_consumption_entry" ADD COLUMN "field_session_id" UUID;

-- AddForeignKey
ALTER TABLE "traceability"."material_consumption_entry" ADD CONSTRAINT "material_consumption_entry_field_session_id_fkey"
  FOREIGN KEY ("field_session_id") REFERENCES "traceability"."field_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
