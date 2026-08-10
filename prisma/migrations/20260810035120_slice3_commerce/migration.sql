-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "commerce";

-- CreateEnum
CREATE TYPE "commerce"."ProductVariantStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "commerce"."CartStatus" AS ENUM ('active', 'converted', 'abandoned');

-- CreateEnum
CREATE TYPE "commerce"."OrderStatus" AS ENUM ('pending_payment', 'paid', 'fulfilled', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "commerce"."PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');

-- AlterTable
ALTER TABLE "core"."product" DROP COLUMN "price_amount",
DROP COLUMN "price_currency";

-- CreateTable
CREATE TABLE "commerce"."product_variant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "variant_name" TEXT,
    "price_amount" DECIMAL(10,2) NOT NULL,
    "price_currency" TEXT NOT NULL DEFAULT 'USD',
    "inventory_count" INTEGER,
    "status" "commerce"."ProductVariantStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "product_variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."cart" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_account_id" UUID NOT NULL,
    "status" "commerce"."CartStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."cart_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cart_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."order" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_number" TEXT NOT NULL,
    "user_account_id" UUID NOT NULL,
    "status" "commerce"."OrderStatus" NOT NULL DEFAULT 'pending_payment',
    "subtotal_amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."order_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."payment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "provider_session_id" TEXT,
    "provider_payment_intent_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "commerce"."PaymentStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_variant_sku_key" ON "commerce"."product_variant"("sku");

-- CreateIndex
CREATE INDEX "product_variant_product_id_idx" ON "commerce"."product_variant"("product_id");

-- CreateIndex
CREATE INDEX "cart_user_account_id_status_idx" ON "commerce"."cart"("user_account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cart_item_cart_id_product_variant_id_key" ON "commerce"."cart_item"("cart_id", "product_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_order_number_key" ON "commerce"."order"("order_number");

-- CreateIndex
CREATE INDEX "order_user_account_id_idx" ON "commerce"."order"("user_account_id");

-- CreateIndex
CREATE INDEX "order_item_order_id_idx" ON "commerce"."order_item"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_session_id_key" ON "commerce"."payment"("provider_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_payment_intent_id_key" ON "commerce"."payment"("provider_payment_intent_id");

-- CreateIndex
CREATE INDEX "payment_order_id_idx" ON "commerce"."payment"("order_id");

-- AddForeignKey
ALTER TABLE "commerce"."product_variant" ADD CONSTRAINT "product_variant_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "core"."product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."product_variant" ADD CONSTRAINT "product_variant_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."cart" ADD CONSTRAINT "cart_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."cart_item" ADD CONSTRAINT "cart_item_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "commerce"."cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."cart_item" ADD CONSTRAINT "cart_item_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "commerce"."product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."order" ADD CONSTRAINT "order_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."order_item" ADD CONSTRAINT "order_item_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce"."order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."order_item" ADD CONSTRAINT "order_item_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "commerce"."product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."payment" ADD CONSTRAINT "payment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce"."order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

