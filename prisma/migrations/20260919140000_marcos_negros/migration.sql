-- AlterTable
ALTER TABLE "apiary"."inspection" ADD COLUMN     "dark_frames" INTEGER;


-- Un conteo de marcos no es negativo. Nulo sigue siendo «no se contó».
ALTER TABLE "apiary"."inspection" ADD CONSTRAINT "inspection_marcos_negros_contados"
  CHECK ("dark_frames" IS NULL OR "dark_frames" >= 0);
