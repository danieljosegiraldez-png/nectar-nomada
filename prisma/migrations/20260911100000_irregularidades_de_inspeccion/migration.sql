-- Las irregularidades de una inspección, contables. VARIAS por inspección.
--
-- QUÉ CIERRA, y lo pide el propio dueño en `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md`
-- §2.3: «Hoy `pestDiseaseFlags` es una cadena. Una cadena no se puede contar, y
-- "todas las colonias con varroa esta temporada" es exactamente el reporte que
-- hace falta.»
--
-- Medido el 2026-09-11: NINGUNA línea de aplicación consulta esa columna. Sólo
-- se escribe y se lee como prosa, así que el reporte que el Anexo nombra no se
-- podía ni intentar.
--
-- POR QUÉ NO REUTILIZA EL CATÁLOGO DE CAUSAS DE PÉRDIDA. Son dos preguntas
-- distintas, y `ADR-111` ya lo dejó escrito al construir aquél: lo que se
-- OBSERVA en una inspección no es lo que MATÓ a la colonia. Varroa vista en
-- marzo en una colonia viva en diciembre es un dato de manejo. Los vocabularios
-- se solapan y no son el mismo: moho, alas deformadas, olor anormal y
-- disentería son señales de inspección y no están entre las causas de pérdida.
--
-- `pest_disease_flags` NO SE TOCA. Se queda como el «Otro | texto, siempre
-- disponible» con que la propia lista del Anexo B termina: el hueco para lo que
-- el catálogo no cubre, igual que `colony.origin_note` junto a
-- `origin_source_value_id`. Deja de ser el único sitio donde vive el dato; no
-- deja de existir.
--
-- EL VOCABULARIO NO ESTÁ AQUÍ. Vive en `research.variable_catalog` y crece por
-- semilla, no por migración — precedente P1, igual que el origen de colonia
-- (A9.10) y las causas de pérdida (ADR-111).
--
-- ADITIVA: no toca ninguna fila. Cero inspecciones tienen texto de plagas hoy
-- (1 inspección en total), así que no hay nada que convertir ni que adivinar.

CREATE TABLE "apiary"."inspection_irregularity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inspection_id" UUID NOT NULL,
    "value_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_irregularity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inspection_irregularity_value_id_idx" ON "apiary"."inspection_irregularity"("value_id");

-- La misma bandera no se marca dos veces en la misma inspección: repetirla no
-- añade información y haría que el reporte contara doble.
CREATE UNIQUE INDEX "inspection_irregularity_inspection_id_value_id_key" ON "apiary"."inspection_irregularity"("inspection_id", "value_id");

ALTER TABLE "apiary"."inspection_irregularity" ADD CONSTRAINT "inspection_irregularity_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "apiary"."inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "apiary"."inspection_irregularity" ADD CONSTRAINT "inspection_irregularity_value_id_fkey" FOREIGN KEY ("value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
