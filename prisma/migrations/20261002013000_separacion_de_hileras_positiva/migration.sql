-- La separación entre hileras de una parcela es positiva o no está.
--
-- `20261001224423_rejilla_y_rangos` dejó este hueco: su
-- `location_rejilla_positiva` cubre `row_count` y `plants_per_row`, y
-- `row_spacing_meters` sólo aparece dentro del `num_nonnulls` que exige los
-- cuatro juntos. Medido el 2026-10-01 con una sonda contra el servicio:
-- `rowSpacingMeters: 0` y `-2.5` SE GUARDABAN. Lo encontró una revisión
-- independiente, no la suite.
--
-- La redacción es la de `20260915210000_marco_de_siembra_y_cohorte_planificada`
-- para la MISMA magnitud en `PlantingCohort`, a propósito: dos restricciones que
-- dicen lo mismo de la misma cosa deben leerse igual.
--
-- Va en la base y no sólo en el servicio porque una restricción que vive en
-- TypeScript no existe para la base: un importador, una reparación operativa o
-- SQL directo se la salta.
ALTER TABLE "core"."location" ADD CONSTRAINT "location_separacion_de_hileras_positiva"
  CHECK ("row_spacing_meters" IS NULL OR "row_spacing_meters" > 0);
