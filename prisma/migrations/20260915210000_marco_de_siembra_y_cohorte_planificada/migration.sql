-- Marco de siembra y cohorte planificada.
--
-- Aprobadas por Daniel el 2026-09-15, y las dos existen por la misma razón: sin
-- ellas hay que escribir algo falso para poder registrar un dato que él tiene.
--
--   * La Pink Bourbon son 600 plantas con objetivo de siembra en octubre de 2026.
--     Sin `planned` sólo cabe `active` —que la suma a los totales de plantado, o
--     sea miente sobre cuántos árboles hay— o no registrarla, que borra una
--     decisión ya tomada.
--   * Su marco es 1,8 × 2,5. Con una sola columna de espaciado hay que elegir cuál
--     de los dos números se guarda, o sea inventar el otro.
--
-- `spacing_meters` NO se rellena hacia atrás desde las nuevas. Las filas viejas
-- nunca declararon si su marco era cuadrado; deducirlo de un número suelto sería
-- fabricar justo el dato que falta. Mismo patrón que `device_id` frente a
-- `capture_device_id` en `measurement`.

-- `ADD VALUE` puede correr dentro de la transacción de la migración mientras el
-- valor nuevo no se USE en la misma transacción. Aquí sólo se añade.
ALTER TYPE "traceability"."PlantingCohortStatus" ADD VALUE 'planned';

ALTER TABLE "traceability"."planting_cohort"
  ADD COLUMN "row_spacing_meters"   DECIMAL(5,2),
  ADD COLUMN "plant_spacing_meters" DECIMAL(5,2);

-- Las dos anulables y por separado, porque un marco a medio conocer —se sabe la
-- calle y no la distancia entre plantas— es corriente en campo, y exigir ambas
-- empujaría a rellenar la que falta. Lo que sí se exige es que, cuando haya
-- número, sea un número posible: un marco de 0 m no existe, y un 0 guardado se
-- lee luego como una densidad infinita.
ALTER TABLE "traceability"."planting_cohort"
  ADD CONSTRAINT "planting_cohort_row_spacing_positivo"
    CHECK ("row_spacing_meters" IS NULL OR "row_spacing_meters" > 0),
  ADD CONSTRAINT "planting_cohort_plant_spacing_positivo"
    CHECK ("plant_spacing_meters" IS NULL OR "plant_spacing_meters" > 0);
