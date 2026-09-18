-- Donde esta un frasco y quien responde por el, con intervalo. Botiquin, Tarea 5.
--
-- DOS PREGUNTAS DISTINTAS, y las dos son de Daniel: «¿donde esta el Apivar?» y
-- «¿quien lo tiene?». El equipo y el medicamento pueden estar bajo distinto
-- custodio o lugar. Es la figura de `storage_assignment`, atada al lote de cafe.
--
-- EL RESPONSABLE ES UNA PERSONA Y NO UNA CUENTA, como `operator_person_id`:
-- quien guarda el frasco a menudo no tiene cuenta. Y es anulable: el sitio basta.
--
-- NUNCA DOS ABIERTAS DEL MISMO LOTE, y lo impone la BASE con un indice unico
-- PARCIAL. Prisma no sabe expresarlo, asi que no va en el esquema — declararlo
-- mal haria que el esquema pidiera algo que esta migracion no crea. Un frasco no
-- puede estar en dos sitios a la vez; sin esto, dos operarios moviendolo a la
-- vez dejarian dos custodias vigentes y el aviso de vencimiento le llegaria a
-- quien no lo tiene.
--
-- Nombres de clave foranea CONVENCIONALES, `<tabla>_<columna>_fkey`: esta semana
-- se tropezo dos veces en abreviarlos.

-- CreateTable
CREATE TABLE "traceability"."consumable_custody" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consumable_lot_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "responsible_person_id" UUID,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "consumable_custody_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consumable_custody_consumable_lot_id_desde_idx"
  ON "traceability"."consumable_custody"("consumable_lot_id", "desde");

-- El indice PARCIAL: una sola custodia abierta por lote.
CREATE UNIQUE INDEX "consumable_custody_una_abierta_por_lote"
  ON "traceability"."consumable_custody"("consumable_lot_id") WHERE "hasta" IS NULL;

-- Un intervalo que termina antes de empezar no significa nada.
ALTER TABLE "traceability"."consumable_custody"
  ADD CONSTRAINT "consumable_custody_hasta_despues_de_desde"
  CHECK ("hasta" IS NULL OR "hasta" >= "desde");

-- AddForeignKey
ALTER TABLE "traceability"."consumable_custody" ADD CONSTRAINT "consumable_custody_consumable_lot_id_fkey"
  FOREIGN KEY ("consumable_lot_id") REFERENCES "traceability"."consumable_lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."consumable_custody" ADD CONSTRAINT "consumable_custody_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."consumable_custody" ADD CONSTRAINT "consumable_custody_responsible_person_id_fkey"
  FOREIGN KEY ("responsible_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "traceability"."consumable_custody" ADD CONSTRAINT "consumable_custody_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
