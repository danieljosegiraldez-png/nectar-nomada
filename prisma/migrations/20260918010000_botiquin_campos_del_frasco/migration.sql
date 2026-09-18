-- Lo que se escribe en CADA compra: vencimiento, proveedor con direccion,
-- factura y presentacion. Botiquin, Tarea 2.
--
-- DEL FRASCO Y NO DEL PRODUCTO: dos frascos del mismo Apivar vencen en fechas
-- distintas y vienen de facturas distintas. `batch_label` ya es el lote del
-- fabricante y `supplier` ya existia.
--
-- NO SE INVENTAN: «proveedor con direccion» y «evidencia de adquisicion» son
-- literales del Reglamento (UE) 2019/6 art. 108; la fecha de caducidad la exige
-- la NOM-064-ZOO-2000 de Mexico. Ver ANEXO_G §5.1.
--
-- EL VENCIMIENTO NULO ES «SIN FECHA», NUNCA «VIGENTE». Lo desconocido no se
-- convierte en bueno. Y no hay CHECK de que sea futura: un frasco ya vencido al
-- recibirlo es un hecho que hay que poder registrar — una compra vieja anotada
-- hoy. Rechazarlo haria que el frasco existiera en la bodega y no en el sistema.

-- AlterTable
ALTER TABLE "traceability"."consumable_lot"
  ADD COLUMN "expires_at" TIMESTAMP(3),
  ADD COLUMN "supplier_address" TEXT,
  ADD COLUMN "invoice_reference" TEXT,
  ADD COLUMN "presentation" TEXT;
