-- Quien ejecuto una transformacion, donde, y cuando salio y volvio el material.
--
-- POR QUE. La trilla no es una maquina, es un arreglo. Finca Rosina / beneficio
-- Las Nubes NO tiene trilladora, y se trilla de tres formas: en Cafelino, en
-- Kiva Estate, o a mano con mazo y pilon en Las Nubes. DOS DE LAS TRES ocurren
-- fuera del control del dueno, y una cadena de custodia que no dice quien tuvo
-- el cafe esos dias no es una cadena.
--
-- TODAS ANULABLES, y no por comodidad: mazo y pilon en la propia finca es una
-- de las tres formas reales. Exigir custodia prohibiria la forma que la finca
-- usa en su propio patio. Nulo en `performed_by_organization_id` significa «la
-- propia organizacion».
--
-- NO SE VALIDA EL ORDEN de custody_out y custody_in aqui. Un material que salio
-- y aun no ha vuelto tiene `custody_in` nulo, y eso es un estado legitimo del
-- mundo, no un error de captura.
--
-- SOBRE LA TRANSFORMACION Y NO SOBRE UN TIPO. Manana un tueste puede hacerse
-- fuera igual que una trilla. Atarlas a `hulling` seria comodo hoy y falso
-- manana. Y NO es una tabla nueva: son columnas sobre la transformacion que ya
-- existe, igual que `drying_run_id` cuelga de ella. Un `hulling_run` paralelo
-- duplicaria lo que `lot_transformation` ya hace.
--
-- Cuatro columnas anulables: aditivo, ninguna fila existente cambia.

-- AlterTable
ALTER TABLE "traceability"."lot_transformation" ADD COLUMN "performed_by_organization_id" UUID;
ALTER TABLE "traceability"."lot_transformation" ADD COLUMN "performed_at_location_id" UUID;
ALTER TABLE "traceability"."lot_transformation" ADD COLUMN "custody_out" TIMESTAMP(3);
ALTER TABLE "traceability"."lot_transformation" ADD COLUMN "custody_in" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "traceability"."lot_transformation" ADD CONSTRAINT "lot_transformation_performed_by_organization_id_fkey"
  FOREIGN KEY ("performed_by_organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_transformation" ADD CONSTRAINT "lot_transformation_performed_at_location_id_fkey"
  FOREIGN KEY ("performed_at_location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
