-- La foto de la etiqueta de un frasco. Botiquin, Tarea 6.
--
-- NO SE INVENTA: el ANEXO_G §5.1 saca de la norma argentina —SENASA obliga a
-- conservar los troqueles o marbetes de los productos veterinarios— su
-- conclusion de diseno: «guardar foto de la etiqueta como adjunto del registro».
--
-- UNA COLUMNA MAS POR PADRE, sin mecanismo nuevo: es el molde que ya siguen las
-- diecinueve columnas de padre de `asset` (ADR-020 decision 8: especifica por
-- padre, no un par polimorfico tipo/id).
--
-- ON DELETE RESTRICT, y es la decision de la casa, no una preferencia. La
-- revision independiente del 2026-09-01 (migracion 20260901100000, §2) cambio
-- `asset_biochar_batch_id_fkey` de SET NULL a RESTRICT con estas palabras:
-- «borrar un lote de biochar dejaba la foto del retorte sin objeto. Conservar
-- el numero y perder el sujeto no es conservar evidencia. RESTRICT es lo
-- coherente con evidencia original inmutable: si alguien quiere borrar el
-- padre, que se entere».
--
-- Una foto de etiqueta es PRUEBA LEGAL —SENASA obliga a conservarla—, y el
-- lote de biochar es el caso mas parecido: un lote de material con su foto.
-- Las columnas `lot_id`, `sample_id` y `colony_id` siguen en SET NULL porque
-- son ANTERIORES a esa revision; no son el criterio vigente. La primera version
-- de esta migracion las copio a ellas, y se rehizo antes de commitear.

-- AlterTable
ALTER TABLE "core"."asset" ADD COLUMN "consumable_lot_id" UUID;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_consumable_lot_id_fkey"
  FOREIGN KEY ("consumable_lot_id") REFERENCES "traceability"."consumable_lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
