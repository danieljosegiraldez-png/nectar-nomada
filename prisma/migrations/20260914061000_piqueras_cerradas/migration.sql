-- A9 · Anexo E §8 — «Piqueras cerradas ○ sí ○ no».
--
-- POR QUÉ SE GUARDA Y NO ES SÓLO UNA CASILLA DE TRÁMITE. Explica una colonia que llega
-- mermada o estresada al destino. Sin el dato, esa merma se queda sin causa candidata y
-- dentro de tres meses nadie puede distinguir «viajó mal» de «ya venía débil».
--
-- ANULABLE, Y SON TRES ESTADOS (ADR-080). `NULL` es «no se anotó»; `false` es «se viajó
-- con las piqueras abiertas», que es una afirmación distinta y peor. Las colocaciones que
-- creó el relleno de la migración anterior lo tienen `NULL` porque no hubo viaje.
--
-- POR QUÉ VA EN SU PROPIA MIGRACIÓN Y NO EDITANDO LA ANTERIOR. La de
-- `20260914060000_colocacion_de_colmena` ya está aplicada en la base de pruebas
-- compartida, y `_prisma_migrations` guarda su suma de comprobación: editarla habría roto
-- `migrate deploy` a cualquier otra sesión que ya la tuviera. Dos migraciones en un PR es
-- el precio correcto.

-- AlterTable
ALTER TABLE "apiary"."hive_placement" ADD COLUMN     "entrances_closed" BOOLEAN;
