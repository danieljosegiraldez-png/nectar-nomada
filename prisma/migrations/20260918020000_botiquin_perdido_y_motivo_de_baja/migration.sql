-- Botado y perdido, con motivo obligatorio. Botiquin, Tarea 4.
--
-- Daniel: «si estan vencidas o se botaron o perdieron». `waste` ya existia;
-- **perder no es botar**. Un frasco botado se sabe donde termino; uno perdido
-- puede estar en alguna parte, y con un medicamento eso es un asunto de
-- seguridad. Colapsarlos perderia justo la distincion que importa.
--
-- EL CHECK COMPARA COMO TEXTO, y es a proposito. `ADD VALUE` y usar el valor
-- nuevo en la misma transaccion falla con «unsafe use of new value», y
-- `prisma db execute` manda el archivo entero como un solo comando. Comparar
-- `event_type::text` no usa el valor del enum, asi que el CHECK se puede crear
-- aqui mismo.
--
-- MOTIVO OBLIGATORIO al botar y al perder, en la BASE: un medicamento que
-- desaparece del saldo sin decir por que no se puede auditar. Es la misma regla
-- que `cse_ajuste_exige_razon` ya aplica a los ajustes, en un CHECK aparte para
-- no tener que borrar y recrear aquel.
--
-- NO SE USA `NOT VALID`: medido, hay CERO filas `waste` en la base de pruebas y
-- nadie llama todavia a `registrarMerma`, asi que no hay filas viejas que el
-- CHECK fuera a rechazar. Si las hubiera en produccion, esta migracion fallaria
-- en voz alta en vez de dejarlas sin validar en silencio.

-- AlterEnum
ALTER TYPE "traceability"."ConsumableStockEventType" ADD VALUE 'lost';

-- Motivo obligatorio al dar de baja
ALTER TABLE "traceability"."consumable_stock_event"
  ADD CONSTRAINT "cse_baja_exige_motivo" CHECK (
    "event_type"::text NOT IN ('waste', 'lost')
    OR ("reason" IS NOT NULL AND btrim("reason") <> '')
  );
