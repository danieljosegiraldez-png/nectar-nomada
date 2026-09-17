-- La liberacion de un lote para la venta.
--
-- POR QUE UN ESTADO Y NO UNA FIRMA. Decision de Daniel, 2026-09-16. La EDAD de
-- reposo es una medicion: sale del fin del secado y del reloj, nadie la
-- declara. La LIBERACION es una decision que no se deriva de ninguna fecha,
-- porque depende del arreglo con el comprador. Una medicion no necesita estado;
-- una decision no se puede tener sin el.
--
-- NO APAGA EL AVISO. Un lote liberado a los 41 dias se enseña liberado Y con 41
-- dias de reposo. Si este estado callara la advertencia de venta temprana,
-- liberar seria la forma de esquivar el sistema — exactamente lo que la
-- doctrina de avisar-y-no-bloquear existe para evitar.
--
-- `released_by` NO lleva clave foranea a proposito, igual que otras columnas de
-- autoria del esquema: la cuenta que libero puede desactivarse, y perder el
-- rastro de quien autorizo una venta seria peor que una fila huerfana.
--
-- Dos columnas anulables: aditivo, ninguna fila existente cambia.

-- AlterTable
ALTER TABLE "traceability"."lot" ADD COLUMN "released_at" TIMESTAMP(3);
ALTER TABLE "traceability"."lot" ADD COLUMN "released_by" UUID;
