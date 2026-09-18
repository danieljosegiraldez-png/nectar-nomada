-- Faenas, división y reinas — Tarea 2: la genealogía de la colonia.
-- NO ACTION y no RESTRICT: protege igual (no se borra una madre con hijas), pero comprueba al final
-- de la sentencia, así que un borrado que se lleva madre e hija juntas no depende del orden de filas.
-- Spec: docs/superpowers/specs/2026-09-18-faenas-division-y-reinas-design.md §3.

ALTER TABLE "apiary"."colony" ADD COLUMN "parent_colony_id" UUID,
ADD COLUMN "combined_into_colony_id" UUID;

ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_parent_colony_id_fkey" FOREIGN KEY ("parent_colony_id") REFERENCES "apiary"."colony"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_combined_into_colony_id_fkey" FOREIGN KEY ("combined_into_colony_id") REFERENCES "apiary"."colony"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- La madre sólo en una división, y la receptora sólo en una unión. SIEMPRE: las columnas son
-- nuevas, así que ninguna fila vieja puede violarlo.
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_madre_solo_en_division"
  CHECK ("parent_colony_id" IS NULL OR "origin_type" = 'split');
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_receptora_solo_en_union"
  CHECK ("combined_into_colony_id" IS NULL OR "status" = 'combined');
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_no_es_su_propia_pareja"
  CHECK ("parent_colony_id" IS DISTINCT FROM "id" AND "combined_into_colony_id" IS DISTINCT FROM "id");

-- Y obligatorias en las filas NUEVAS. NOT VALID no revisa las que ya existen: producción puede
-- tener divisiones o uniones registradas antes de hoy sin pareja, y adivinársela sería inventar
-- (ADR-080). Toda fila que se inserte o se actualice desde ahora sí se revisa.
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_division_con_madre"
  CHECK ("origin_type" <> 'split' OR "parent_colony_id" IS NOT NULL) NOT VALID;
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_union_con_receptora"
  CHECK ("status" <> 'combined' OR "combined_into_colony_id" IS NOT NULL) NOT VALID;

CREATE INDEX "colony_parent_colony_id_idx" ON "apiary"."colony"("parent_colony_id");
