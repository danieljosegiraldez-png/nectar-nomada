-- Por qué se perdió una colonia. VARIAS causas por pérdida, no una.
--
-- QUÉ CIERRA. `20260909010000_fin_de_colonia` añadió `ended_at` y su cabecera
-- decía, con razón para aquel día: «LA CAUSA NO ENTRA AQUÍ. Un vocabulario de
-- causas es conocimiento del dueño: se le pregunta, no se inventa.» Se
-- preguntó el 2026-09-09. Ésta es la respuesta.
--
-- POR QUÉ UNA TABLA Y NO UNA COLUMNA. El dueño: «cuando hay pérdida de colonia
-- hay múltiples razones y/o causales y situaciones». Una FK sola obligaría a
-- elegir entre varroa y hambre cuando la respuesta honesta es las dos. La
-- literatura coincide: en el monitoreo latinoamericano de SOLATINA —donde
-- Panamá participa— la categoría que más creció son las cajas vacías «por
-- enfermedades, ausentamiento e intoxicaciones» juntas.
--
-- POR QUÉ `provenance_class` ES OBLIGATORIO Y SIN DEFECTO. Una causa de
-- pérdida casi nunca se ve: se deduce de una caja vacía dos semanas después.
-- El estándar internacional pregunta por «hambre SOSPECHADA» y «exposición
-- tóxica SOSPECHADA», y el caso de Toabré documentado en
-- `48_A9_ANEXO_C_TABLERO_Y_REPORTES.md` es literalmente «una hipótesis en
-- pie». `CLAUDE.md` §3 prohíbe guardar una inferencia como hecho. Un valor por
-- defecto convertiría cada sospecha en observación en silencio, así que no lo
-- hay: la capa de servicio tiene que decir cómo se estableció.
--
-- `combined` EN `ColonyStatus`. El estándar clasifica como pérdida la colonia
-- con «problema de reina irresoluble»: viva, no recuperable, se combina o se
-- elimina. Sin este valor esa colonia se quedaba `active` para siempre e
-- inflaba el conteo contra el compromiso de polinización con abejas que ya no
-- están en esa caja. Decisión del dueño: cuenta como fin.
--
-- EL VOCABULARIO NO ESTÁ AQUÍ. Vive en `research.variable_catalog` y crece por
-- semilla, no por migración — mismo mecanismo que el origen de colonia (A9.10)
-- y mismo precedente P1. Añadir una causa el día que aparezca es una línea en
-- `lib/research/catalogs.ts` y un `db:seed`.
--
-- ADITIVA: no toca ninguna fila existente. Ninguna colonia tiene causas
-- todavía, que es exactamente lo que se sabe de ellas.

ALTER TYPE "apiary"."ColonyStatus" ADD VALUE 'combined';

CREATE TABLE "apiary"."colony_loss_cause" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "colony_id" UUID NOT NULL,
    "cause_value_id" UUID NOT NULL,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "data_quality" "core"."DataQuality",
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "colony_loss_cause_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "colony_loss_cause_cause_value_id_idx" ON "apiary"."colony_loss_cause"("cause_value_id");

-- La misma causa no se anota dos veces para la misma colonia: repetirla no
-- añade información y haría que un reporte contara doble.
CREATE UNIQUE INDEX "colony_loss_cause_colony_id_cause_value_id_key" ON "apiary"."colony_loss_cause"("colony_id", "cause_value_id");

ALTER TABLE "apiary"."colony_loss_cause" ADD CONSTRAINT "colony_loss_cause_colony_id_fkey" FOREIGN KEY ("colony_id") REFERENCES "apiary"."colony"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "apiary"."colony_loss_cause" ADD CONSTRAINT "colony_loss_cause_cause_value_id_fkey" FOREIGN KEY ("cause_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "apiary"."colony_loss_cause" ADD CONSTRAINT "colony_loss_cause_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
