-- La cereza cosechada se registra como dato, no como prosa.
--
-- DECISION DEL DUENO (2026-09-11): «condition field should be fixed options
-- that can be selected», y antes: «register details and vital statistics of
-- harvested cherries before becoming a lot».
--
-- QUE CIERRA. `harvest_event.condition` era TEXTO LIBRE. Medido antes de tocar
-- nada: **29 de 33 cosechas** lo tenian relleno y las 29 decian exactamente
-- «Ripe Cherry». Esa es la prueba de por que una caja de texto no sirve para un
-- hecho que se quiere contar: acaba siendo un valor que nadie varia, y despues
-- nadie puede preguntar cuantas cosechas entraron pintonas.
--
-- EL VOCABULARIO YA ESTABA ESCRITO Y SIN PUERTA. `lib/research/catalogs.ts`
-- define SIETE catalogos de cereza —color, firmeza, defectos, limpieza,
-- condicion visual, densidad, tamano/forma— con 35 valores entre todos, y
-- **ninguna linea de codigo los leia**. Daniel eligio tres: los que deciden que
-- se puede hacer con esa cereza. Los otros cuatro siguen disponibles y entran
-- el dia que los use de verdad, sin migracion: son filas de catalogo.
--
-- POR QUE COLUMNAS Y NO UNA TABLA DE ATRIBUTOS. `apiary.colony_loss_cause` es
-- una tabla porque el dueno dijo «multiples razones y/o causales» y una FK sola
-- habria obligado a elegir entre varroa y hambre. Aqui es al reves: cada eje
-- tiene UN valor por cosecha — una cereza no es roja y verde a la vez. Mismo
-- idioma que `traceability.lot_process.process_grade_value_id`.
--
-- POR QUE ANULABLES, y por que no se traduce lo viejo. Las 33 cosechas que ya
-- existen no tienen estos valores. Mapear «Ripe Cherry» a `rojo` seria inferir
-- un hecho y guardarlo como tal, que `CLAUDE.md` §3 prohibe en su primera
-- linea. Ausencia significa «no se registro», NUNCA «sano y limpio». Por eso
-- `condition` **no se borra**: las 29 conservan su prosa y se leen como lo que
-- son.
--
-- `ripeness_notes` SI SE BORRA, y se conto antes: **0 filas** la usaban. Era una
-- segunda caja de texto para lo que el catalogo de color cubre con siete
-- valores, y ninguna pantalla la llenaba nunca.

ALTER TABLE "traceability"."harvest_event"
  ADD COLUMN "cherry_color_value_id" UUID,
  ADD COLUMN "cherry_defects_value_id" UUID,
  ADD COLUMN "cherry_cleanliness_value_id" UUID;

CREATE INDEX "harvest_event_cherry_color_value_id_idx" ON "traceability"."harvest_event"("cherry_color_value_id");
CREATE INDEX "harvest_event_cherry_defects_value_id_idx" ON "traceability"."harvest_event"("cherry_defects_value_id");
CREATE INDEX "harvest_event_cherry_cleanliness_value_id_idx" ON "traceability"."harvest_event"("cherry_cleanliness_value_id");

ALTER TABLE "traceability"."harvest_event" ADD CONSTRAINT "harvest_event_cherry_color_value_id_fkey" FOREIGN KEY ("cherry_color_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."harvest_event" ADD CONSTRAINT "harvest_event_cherry_defects_value_id_fkey" FOREIGN KEY ("cherry_defects_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."harvest_event" ADD CONSTRAINT "harvest_event_cherry_cleanliness_value_id_fkey" FOREIGN KEY ("cherry_cleanliness_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Contada antes de borrar: 0 filas la usaban. Si alguna vez esta cuenta no da
-- cero, esta migracion esta mal y hay que pararla.
DO $$
DECLARE con_datos INTEGER;
BEGIN
  SELECT count(*) INTO con_datos FROM "traceability"."harvest_event" WHERE "ripeness_notes" IS NOT NULL;
  IF con_datos > 0 THEN
    RAISE EXCEPTION 'ripeness_notes tiene % fila(s) con dato: no se borra sin decidir que hacer con ellas', con_datos;
  END IF;
END $$;

ALTER TABLE "traceability"."harvest_event" DROP COLUMN "ripeness_notes";
