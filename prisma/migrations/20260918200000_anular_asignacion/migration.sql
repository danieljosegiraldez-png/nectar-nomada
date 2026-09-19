-- ADR-170 -- una asignacion a la tienda que nunca se recibio se anula, con quien, cuando y por que.

-- AlterTable
ALTER TABLE "commerce"."store_allocation" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by" UUID;

-- AddForeignKey
ALTER TABLE "commerce"."store_allocation" ADD CONSTRAINT "store_allocation_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- La anulacion va entera o no va, y dice por que.
ALTER TABLE "commerce"."store_allocation" ADD CONSTRAINT "store_allocation_anulacion_completa"
  CHECK (("cancelled_at" IS NULL) = ("cancelled_by" IS NULL)
     AND ("cancelled_at" IS NULL) = ("cancel_reason" IS NULL)
     AND ("cancel_reason" IS NULL OR btrim("cancel_reason") <> ''));
-- Recibida o anulada, nunca las dos: lo que llego al estante no se anula.
ALTER TABLE "commerce"."store_allocation" ADD CONSTRAINT "store_allocation_recibida_o_anulada"
  CHECK ("received_at" IS NULL OR "cancelled_at" IS NULL);
