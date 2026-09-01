-- S1 — Measurement acepta un sujeto que no es café
-- (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2).
--
-- Aditiva: una columna nullable y su índice. Ninguna fila existente cambia, y
-- ninguna consulta actual la mira.
--
-- Los ocho FK que Measurement ya tenía son todos de la cadena del café: Lot y
-- Sample como sujetos, y seis enlaces (roast, fermentación, secado,
-- almacenamiento, TreatmentBatch, ProcessingStage) que EXIGEN un lot_id al
-- lado. Éste es distinto: es un sujeto independiente, y excluye lot_id en vez
-- de exigirlo. Su autorización también es otra —location:manage_attributes
-- contra el sitio donde el lote se produjo, no lot:manage—, y por eso el
-- servicio resuelve el ámbito por rama.
--
-- No se añaden aquí las columnas de muestra de suelo ni de muestra foliar. No
-- existen esas tablas todavía, y una columna que nada escribe es peso muerto
-- que además parece una capacidad que el sistema no tiene.
ALTER TABLE "traceability"."measurement"
  ADD COLUMN "biochar_batch_id" UUID;

CREATE INDEX "measurement_biochar_batch_id_idx"
  ON "traceability"."measurement"("biochar_batch_id");

ALTER TABLE "traceability"."measurement"
  ADD CONSTRAINT "measurement_biochar_batch_id_fkey"
  FOREIGN KEY ("biochar_batch_id") REFERENCES "traceability"."biochar_batch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
