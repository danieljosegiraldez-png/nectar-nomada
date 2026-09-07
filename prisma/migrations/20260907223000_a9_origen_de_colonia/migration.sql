-- A9.10 (D6) — el origen de una colonia deja de ser prosa.
--
-- La fila del ticket decía «Colony.originType a VariableCatalog». Nombraba la
-- columna equivocada: `origin_type` ya es un enum y ya agrupa. Lo que no
-- agrupa es `origin_note`, que es texto libre, y por eso «compará Parita
-- contra Santa Fe» era leer prosa en vez de una consulta. Eso es lo que D6
-- pide y lo que esta migración resuelve.
--
-- Una FK, no un grafo: la genealogía de división sigue [DEFERRED]
-- (DOMAIN_MODEL.md:205) y esto no la reabre.
--
-- `origin_note` NO se toca ni se migra: se queda para lo que no cabe en el
-- catálogo. La columna nueva es anulable porque las colonias ya guardadas no
-- tienen el dato, y «sin registro» es distinto de un valor inventado.
--
-- Los valores del catálogo NO entran aquí: son semilla, no esquema. Es el
-- precedente P1 —un vocabulario que crece es una entrada de catálogo más un
-- re-seed, nunca una migración— y viven en `lib/research/catalogs.ts`.
--
-- NOTA sobre lo que este archivo NO trae. `prisma migrate diff` propone además
-- sentencias sobre `traceability.lot_process`, `drying_run` y
-- `fermentation_run`. Esa deriva ya está en `origin/main` ANTES de este cambio
-- —medida con el esquema sin tocar— y viene de los PR #227/#228. No entra
-- aquí: son decisiones de `onDelete` e índices de otra sesión.

ALTER TABLE "apiary"."colony"
  ADD COLUMN "origin_source_value_id" UUID;

ALTER TABLE "apiary"."colony"
  ADD CONSTRAINT "colony_origin_source_value_id_fkey"
  FOREIGN KEY ("origin_source_value_id")
  REFERENCES "research"."variable_catalog_value"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "colony_origin_source_value_id_idx"
  ON "apiary"."colony"("origin_source_value_id");
