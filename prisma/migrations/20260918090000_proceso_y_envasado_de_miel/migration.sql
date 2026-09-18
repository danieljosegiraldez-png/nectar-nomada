-- ADR-161 -- procesar y envasar miel como pasos del lote.

-- CreateEnum
CREATE TYPE "traceability"."HoneyProcessAct" AS ENUM ('colado', 'filtrado', 'decantacion_maduracion', 'homogenizado', 'otro');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "traceability"."LotTransformationType" ADD VALUE 'honey_processing';
ALTER TYPE "traceability"."LotTransformationType" ADD VALUE 'packaging';

-- AlterTable
ALTER TABLE "traceability"."lot_transformation" ADD COLUMN     "honey_process_acts" "traceability"."HoneyProcessAct"[],
ADD COLUMN     "honey_process_other_note" TEXT,
ADD COLUMN     "package_count" INTEGER,
ADD COLUMN     "package_net_mass_g" DECIMAL(10,2);


-- Las reglas viven TAMBIEN en la base. Se compara `transformation_type::text` y no el literal
-- del enum: los valores recien anadidos no se pueden usar en la misma transaccion que los crea.

-- Los actos existen si y solo si es un proceso de miel, y entonces hay al menos uno.
ALTER TABLE "traceability"."lot_transformation" ADD CONSTRAINT "lot_transformation_actos_de_miel"
  CHECK (("transformation_type"::text = 'honey_processing') = (coalesce(cardinality("honey_process_acts"), 0) > 0));

-- «otro» dice cual, y la nota solo existe cuando hay «otro».
ALTER TABLE "traceability"."lot_transformation" ADD CONSTRAINT "lot_transformation_otro_acto_dice_cual"
  CHECK (coalesce("honey_process_acts"::text[] @> ARRAY['otro'], false)
         = ("honey_process_other_note" IS NOT NULL AND btrim("honey_process_other_note") <> ''));

-- El envasado dice cuantos envases y de que masa; nada mas los lleva, y los dos son positivos.
ALTER TABLE "traceability"."lot_transformation" ADD CONSTRAINT "lot_transformation_envasado_completo"
  CHECK (CASE WHEN "transformation_type"::text = 'packaging'
              THEN "package_count" IS NOT NULL AND "package_net_mass_g" IS NOT NULL
              ELSE "package_count" IS NULL AND "package_net_mass_g" IS NULL END);
ALTER TABLE "traceability"."lot_transformation" ADD CONSTRAINT "lot_transformation_envasado_positivo"
  CHECK (("package_count" IS NULL OR "package_count" > 0) AND ("package_net_mass_g" IS NULL OR "package_net_mass_g" > 0));
