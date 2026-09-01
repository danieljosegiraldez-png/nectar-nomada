-- S1 — fotografías de la tierra: dos padres nuevos para `asset`
-- (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2).
--
-- Aditiva: dos columnas nullable y sus índices.
--
-- Son los DOS sitios donde el marco pide fotografía explícitamente: el Paso 2
-- («fotografiar el retorte y el proceso») y el Paso 4 («fotografiar cada perfil
-- con una escala»). Una foto general de un bloque ya cabía en
-- `asset.location_id`, que existe desde el principio.
--
-- NO se añaden columnas para muestra de suelo ni foliar: el marco no pide fotos
-- de ellas. Una columna que nada escribe es peso muerto y además parece una
-- capacidad que el sistema no tiene. (En un mensaje anterior dije que hacían
-- falta en tres sitios; al ir a mirarlo, son dos.)
ALTER TABLE "core"."asset"
  ADD COLUMN "biochar_batch_id" UUID,
  ADD COLUMN "soil_profile_id"  UUID;

CREATE INDEX "asset_biochar_batch_id_idx" ON "core"."asset"("biochar_batch_id");
CREATE INDEX "asset_soil_profile_id_idx"  ON "core"."asset"("soil_profile_id");

ALTER TABLE "core"."asset"
  ADD CONSTRAINT "asset_biochar_batch_id_fkey"
  FOREIGN KEY ("biochar_batch_id") REFERENCES "traceability"."biochar_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "asset_soil_profile_id_fkey"
  FOREIGN KEY ("soil_profile_id") REFERENCES "traceability"."soil_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
