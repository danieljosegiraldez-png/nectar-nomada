-- AlterTable
ALTER TABLE "apiary"."queen" ADD COLUMN     "birth_year" INTEGER;


-- Un año imposible no es un año. El límite superior (no nacer después de llegar a la colonia) lo
-- comprueba el servicio: depende de la tenencia, que vive en otra tabla.
ALTER TABLE "apiary"."queen" ADD CONSTRAINT "queen_nacimiento_razonable"
  CHECK ("birth_year" IS NULL OR "birth_year" >= 1990);
