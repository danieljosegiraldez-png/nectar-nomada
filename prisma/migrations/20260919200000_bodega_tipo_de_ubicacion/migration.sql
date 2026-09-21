-- La bodega: donde se guarda el café (y lo que sea) entre el secado y la venta.
-- Tipo propio, como `beneficio` (spec 2026-09-19 §4.1): sin tipo, nada distingue
-- una bodega de otro lugar salvo su nombre.
ALTER TYPE "core"."LocationType" ADD VALUE 'storage_facility';
