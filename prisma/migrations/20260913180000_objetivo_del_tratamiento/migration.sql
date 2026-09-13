-- A9 · Anexo B §4 — «Objetivo» y «Vía» de una aplicación fitosanitaria.
--
-- «Objetivo» es **el último campo que el Anexo marca obligatorio y que seguía sin
-- existir**, con su consecuencia escrita: «eficacia por objetivo; hoy no se puede
-- agrupar». Pasa a ser obligatorio en la capa de servicio cuando el evento es un
-- tratamiento, igual que el lote del producto y los días de carencia. Medido el
-- 2026-09-13: **0 tratamientos en la copia local**, así que exigirlo no deja
-- ninguna fila existente en falso.
--
-- Enum propio y NO el catálogo de irregularidades, aunque cuatro valores se
-- llamen igual: lo que se observa no es lo que se trata (misma distinción que
-- ADR-114 hizo entre observación y causa de pérdida). El conjunto lo cerró el
-- dueño en `protocolos/apiario-campo-v1.json`.
--
-- Lo que NO trae esta rebanada, y está anotado en vez de fingido: «Fecha de
-- retiro» y «Eficacia observada» son de etapa **cierre** —se anotan semanas
-- después— y no existe camino para corregir o completar un `ColonyEvent` ya
-- escrito. Añadir la columna sin ese camino sería una columna que nadie puede
-- rellenar, que es exactamente lo que le pasó a `coverage_until` durante seis
-- días (ADR-118). Ver `PENDING_IMPLEMENTATIONS/011`.
--
-- Y como en las anteriores: NO trae las once líneas sobre `traceability`
-- —`harvest_event`, `lot_process`, `drying_run`, `fermentation_run`— que
-- `migrate diff` propone. Es deriva previa, ajena a este cambio, y creciendo.

-- CreateEnum
CREATE TYPE "apiary"."TreatmentTarget" AS ENUM ('varroa', 'polilla_cera', 'escarabajo_colmena', 'hormigas', 'otro');

-- CreateEnum
CREATE TYPE "apiary"."TreatmentRoute" AS ENUM ('tira', 'goteo', 'espolvoreo', 'vaporizacion', 'cebo', 'otro');

-- AlterTable
ALTER TABLE "apiary"."colony_event" ADD COLUMN     "treatment_target" "apiary"."TreatmentTarget",
ADD COLUMN     "treatment_route" "apiary"."TreatmentRoute";
