-- Los nombres que Prisma espera para las dos claves foraneas del libro mayor.
--
-- CORRECCION hacia delante, no edicion de la migracion anterior: una migracion
-- aplicada no se edita, porque quien ya la corrio no la volveria a correr.
--
-- POR QUE PASO. Abrevie `consumable_stock_event_*` a `cse_*` al escribir el SQL
-- a mano. Prisma deriva el nombre de la tabla y la columna, asi que cualquier
-- abreviatura mia es deriva desde el primer dia — y el guardia
-- `derivaDeMigraciones` la caza. Es la SEGUNDA vez esta semana: la primera fue
-- con los `apo_*` de los ajustes de permiso. La leccion es la misma y ahora
-- esta escrita dos veces: **al escribir SQL a mano, los nombres los pone la
-- convencion, no la comodidad.**
--
-- Los dos CHECK conservan su nombre corto a proposito: Prisma no los conoce, no
-- hay convencion que romper, y `cse_ajuste_exige_razon` se lee mejor.

ALTER TABLE "traceability"."consumable_stock_event"
  RENAME CONSTRAINT "cse_consumable_lot_id_fkey" TO "consumable_stock_event_consumable_lot_id_fkey";
ALTER TABLE "traceability"."consumable_stock_event"
  RENAME CONSTRAINT "cse_created_by_fkey" TO "consumable_stock_event_created_by_fkey";
