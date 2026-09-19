-- CreateTable
CREATE TABLE "apiary"."harvest_container" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "apiary_harvest_event_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "gross_kg" DECIMAL(10,3) NOT NULL,
    "tare_kg" DECIMAL(10,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "harvest_container_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "harvest_container_apiary_harvest_event_id_label_key" ON "apiary"."harvest_container"("apiary_harvest_event_id", "label");

-- AddForeignKey
ALTER TABLE "apiary"."harvest_container" ADD CONSTRAINT "harvest_container_apiary_harvest_event_id_fkey" FOREIGN KEY ("apiary_harvest_event_id") REFERENCES "apiary"."apiary_harvest_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."harvest_container" ADD CONSTRAINT "harvest_container_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un recipiente lleno pesa más que vacío, y vacío no pesa menos que nada.
ALTER TABLE "apiary"."harvest_container" ADD CONSTRAINT "harvest_container_pesos_posibles"
  CHECK ("tare_kg" >= 0 AND "gross_kg" > "tare_kg");
-- Una etiqueta en blanco no distingue nada.
ALTER TABLE "apiary"."harvest_container" ADD CONSTRAINT "harvest_container_etiqueta_dice_algo"
  CHECK (btrim("label") <> '');
