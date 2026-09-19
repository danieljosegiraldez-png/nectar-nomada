-- ADR-169 -- de que lote salio cada frasco vendido, dicho por quien despacha.

-- CreateTable
CREATE TABLE "commerce"."order_item_lot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_item_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "units" INTEGER NOT NULL,
    "quantity_event_id" UUID NOT NULL,
    "dispatched_at" TIMESTAMP(3) NOT NULL,
    "dispatched_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_lot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_item_lot_quantity_event_id_key" ON "commerce"."order_item_lot"("quantity_event_id");

-- CreateIndex
CREATE INDEX "order_item_lot_lot_id_idx" ON "commerce"."order_item_lot"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_item_lot_order_item_id_lot_id_key" ON "commerce"."order_item_lot"("order_item_id", "lot_id");

-- AddForeignKey
ALTER TABLE "commerce"."order_item_lot" ADD CONSTRAINT "order_item_lot_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "commerce"."order_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."order_item_lot" ADD CONSTRAINT "order_item_lot_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."order_item_lot" ADD CONSTRAINT "order_item_lot_quantity_event_id_fkey" FOREIGN KEY ("quantity_event_id") REFERENCES "traceability"."quantity_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."order_item_lot" ADD CONSTRAINT "order_item_lot_dispatched_by_fkey" FOREIGN KEY ("dispatched_by") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un despacho de cero frascos no despacha nada.
ALTER TABLE "commerce"."order_item_lot" ADD CONSTRAINT "order_item_lot_unidades_positivas" CHECK ("units" > 0);
