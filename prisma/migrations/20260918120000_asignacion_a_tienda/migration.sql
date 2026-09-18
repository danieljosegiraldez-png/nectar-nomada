-- ADR-163 -- envases de un lote envasado asignados a la tienda, y su recepcion.

-- CreateTable
CREATE TABLE "commerce"."store_allocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lot_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "units_assigned" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL,
    "assigned_by" UUID NOT NULL,
    "received_at" TIMESTAMP(3),
    "received_by" UUID,
    "units_received" INTEGER,
    "receipt_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_allocation_lot_id_idx" ON "commerce"."store_allocation"("lot_id");

-- CreateIndex
CREATE INDEX "store_allocation_product_variant_id_idx" ON "commerce"."store_allocation"("product_variant_id");

-- CreateIndex
CREATE INDEX "store_allocation_received_at_idx" ON "commerce"."store_allocation"("received_at");

-- AddForeignKey
ALTER TABLE "commerce"."store_allocation" ADD CONSTRAINT "store_allocation_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."store_allocation" ADD CONSTRAINT "store_allocation_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "commerce"."product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."store_allocation" ADD CONSTRAINT "store_allocation_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."store_allocation" ADD CONSTRAINT "store_allocation_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Las reglas viven TAMBIEN en la base.
ALTER TABLE "commerce"."store_allocation" ADD CONSTRAINT "store_allocation_asignados_positivos"
  CHECK ("units_assigned" > 0);
-- La recepcion va entera o no va: quien, cuando y cuantos.
ALTER TABLE "commerce"."store_allocation" ADD CONSTRAINT "store_allocation_recepcion_completa"
  CHECK (("received_at" IS NULL) = ("received_by" IS NULL) AND ("received_at" IS NULL) = ("units_received" IS NULL));
-- No llega mas de lo asignado, ni menos de cero.
ALTER TABLE "commerce"."store_allocation" ADD CONSTRAINT "store_allocation_recibidos_en_rango"
  CHECK ("units_received" IS NULL OR ("units_received" >= 0 AND "units_received" <= "units_assigned"));
-- Si llega menos de lo asignado, se dice por que (envases rotos, se quedaron en la finca...).
ALTER TABLE "commerce"."store_allocation" ADD CONSTRAINT "store_allocation_faltante_dice_por_que"
  CHECK ("units_received" IS NULL OR "units_received" = "units_assigned"
         OR ("receipt_note" IS NOT NULL AND btrim("receipt_note") <> ''));
