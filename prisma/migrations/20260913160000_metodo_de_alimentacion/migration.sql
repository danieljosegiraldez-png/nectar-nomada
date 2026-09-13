-- A9 · Anexo B §3 — «Método» de alimentación, el único campo de esa sección que
-- no existía como columna.
--
-- El vocabulario es el del dueño, tal cual en `protocolos/apiario-campo-v1.json`:
-- «bolsa sobre cabezales» es literalmente lo que se usó en Toabré. Opcional,
-- porque el Anexo no lo marca obligatorio y porque el dato que dispara el aviso
-- es `coverage_until`, no éste.
--
-- `coverage_until` NO se toca aquí: la columna ya existía desde
-- `20260907214500_a9_vitales_del_sitio`. Lo que esta rebanada le añade no es
-- esquema, es camino — un formulario que la escriba y un servicio que la exija —
-- porque medido el 2026-09-13 había **1 alimentación y ninguna con ese valor**:
-- la columna existía, los vitales del sitio ya la leían, y ninguna pantalla
-- podía rellenarla.
--
-- LO QUE ESTA MIGRACIÓN NO TRAE, Y ES DELIBERADO: las once líneas sobre
-- `traceability.harvest_event`, `lot_process`, `drying_run` y `fermentation_run`
-- que `migrate diff` propone. Son deriva previa entre el esquema y las
-- migraciones, ajena a este cambio. **Y está creciendo:** eran seis hasta el
-- 2026-09-12 y son once desde que entró la #282, que sumó las tres FK y los tres
-- índices de la cereza. Arrastrarlas aquí las atribuiría a esta rebanada.

-- CreateEnum
CREATE TYPE "apiary"."FeedingMethod" AS ENUM ('bolsa_sobre_cabezales', 'alimentador_entrada', 'alimentador_division', 'otro');

-- AlterTable
ALTER TABLE "apiary"."colony_event" ADD COLUMN     "feeding_method" "apiary"."FeedingMethod";
