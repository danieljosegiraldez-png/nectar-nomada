-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "experiences";

-- CreateEnum
CREATE TYPE "experiences"."ExperienceSessionStatus" AS ENUM ('scheduled', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "experiences"."BookingStatus" AS ENUM ('pending_payment', 'confirmed', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "experiences"."BookingPaymentStatus" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');

-- CreateTable
CREATE TABLE "experiences"."experience_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "experience_id" UUID NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "capacity_total" INTEGER,
    "capacity_remaining" INTEGER,
    "status" "experiences"."ExperienceSessionStatus" NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "experience_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiences"."booking" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_number" TEXT NOT NULL,
    "experience_session_id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "status" "experiences"."BookingStatus" NOT NULL DEFAULT 'pending_payment',
    "participant_count" INTEGER NOT NULL DEFAULT 1,
    "unit_price_amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiences"."participant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiences"."booking_payment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "provider_session_id" TEXT,
    "provider_payment_intent_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "experiences"."BookingPaymentStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "experience_session_experience_id_idx" ON "experiences"."experience_session"("experience_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_booking_number_key" ON "experiences"."booking"("booking_number");

-- CreateIndex
CREATE INDEX "booking_user_account_id_idx" ON "experiences"."booking"("user_account_id");

-- CreateIndex
CREATE INDEX "booking_experience_session_id_idx" ON "experiences"."booking"("experience_session_id");

-- CreateIndex
CREATE INDEX "participant_booking_id_idx" ON "experiences"."participant"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_payment_provider_session_id_key" ON "experiences"."booking_payment"("provider_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_payment_provider_payment_intent_id_key" ON "experiences"."booking_payment"("provider_payment_intent_id");

-- CreateIndex
CREATE INDEX "booking_payment_booking_id_idx" ON "experiences"."booking_payment"("booking_id");

-- AddForeignKey
ALTER TABLE "experiences"."experience_session" ADD CONSTRAINT "experience_session_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "core"."experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences"."experience_session" ADD CONSTRAINT "experience_session_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences"."booking" ADD CONSTRAINT "booking_experience_session_id_fkey" FOREIGN KEY ("experience_session_id") REFERENCES "experiences"."experience_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences"."booking" ADD CONSTRAINT "booking_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences"."participant" ADD CONSTRAINT "participant_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "experiences"."booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences"."booking_payment" ADD CONSTRAINT "booking_payment_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "experiences"."booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

