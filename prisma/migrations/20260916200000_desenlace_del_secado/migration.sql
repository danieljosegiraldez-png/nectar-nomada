-- Como termino un secado, que `ended_at` no distingue.
--
-- POR QUE. Llegar a la humedad objetivo y abandonar el secado son hechos
-- distintos y dan exactamente la misma fecha de cierre. El reloj del reposo
-- —los 30 dias para muestrear y los 60 para vender— arranca al ALCANZAR el
-- objetivo, no al dejar de secar. Sin esta columna, ese reloj tendria que
-- arrancar de un dato que significa dos cosas.
--
-- ANULABLE A PROPOSITO Y PARA SIEMPRE. Todos los secados cerrados antes del
-- 2026-09-16 no lo tienen, y hacerlo obligatorio los invalidaria a todos. Un
-- secado sin desenlace declarado no reposa, pero tampoco es un error: el motor
-- emite `SECADO_SIN_OBJETIVO_ALCANZADO` como limitacion nombrada en vez de
-- callarse. Avisa, no bloquea.
--
-- POR QUE `interrupted` Y NO SOLO DOS VALORES. Para el reposo, abandonado e
-- interrumpido son lo mismo: ninguno arranca el reloj. Para el productor no lo
-- son: uno es una decision sobre el cafe y el otro una lluvia o una averia.
-- Colapsarlos perderia informacion que el sistema no puede recuperar despues.
--
-- Anadir un tipo y una columna anulable es aditivo: ninguna fila existente
-- cambia y ninguna consulta de hoy devuelve algo distinto.

-- CreateEnum
CREATE TYPE "traceability"."DryingOutcome" AS ENUM ('target_reached', 'abandoned', 'interrupted');

-- AlterTable
ALTER TABLE "traceability"."drying_run" ADD COLUMN "ended_outcome" "traceability"."DryingOutcome";
