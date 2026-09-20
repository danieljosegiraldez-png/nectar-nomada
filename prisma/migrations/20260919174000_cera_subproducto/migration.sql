-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "traceability"."ByproductDestination" ADD VALUE 'LAMINA_PROPIA';
ALTER TYPE "traceability"."ByproductDestination" ADD VALUE 'GUARDADA';
ALTER TYPE "traceability"."ByproductDestination" ADD VALUE 'OTRO';

-- AlterEnum
ALTER TYPE "traceability"."ByproductType" ADD VALUE 'CERA';

-- AlterTable
ALTER TABLE "traceability"."byproduct_batch" ADD COLUMN     "window_end" TIMESTAMP(3),
ADD COLUMN     "window_start" TIMESTAMP(3),
ALTER COLUMN "transformation_id" DROP NOT NULL;



-- Un subproducto sale de una transformación (la cascarilla, la cera del colado), O de un apiario
-- con su ventana (la cera del desopercular). Nunca de los dos, nunca de ninguno: sin origen no es
-- trazable, y la trazabilidad es la razón de esta tabla.
ALTER TABLE "traceability"."byproduct_batch" ADD CONSTRAINT "byproduct_batch_un_solo_origen"
  CHECK (
    ("transformation_id" IS NOT NULL AND "window_start" IS NULL AND "window_end" IS NULL)
    OR ("transformation_id" IS NULL AND "window_start" IS NOT NULL AND "window_end" IS NOT NULL)
  );
-- Una ventana que termina antes de empezar no es una ventana.
ALTER TABLE "traceability"."byproduct_batch" ADD CONSTRAINT "byproduct_batch_ventana_en_orden"
  CHECK ("window_start" IS NULL OR "window_start" <= "window_end");
-- «Otro uso» sin decir cuál no dice nada. El valor se compara como TEXTO porque se añade al enum
-- en esta misma migración, y un valor nuevo no se puede usar en la transacción que lo añade.
ALTER TABLE "traceability"."byproduct_batch" ADD CONSTRAINT "byproduct_batch_otro_dice_por_que"
  CHECK ("destination"::text <> 'OTRO' OR btrim(coalesce("notes", '')) <> '');
