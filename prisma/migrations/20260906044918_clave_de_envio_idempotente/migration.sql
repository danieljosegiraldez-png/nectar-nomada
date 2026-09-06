-- CreateTable
CREATE TABLE "core"."submission_key" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "user_account_id" UUID NOT NULL,
    "result_type" TEXT NOT NULL,
    "result_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "submission_key_key_key" ON "core"."submission_key"("key");

-- CreateIndex
CREATE INDEX "submission_key_created_at_idx" ON "core"."submission_key"("created_at");

-- AddForeignKey
ALTER TABLE "core"."submission_key" ADD CONSTRAINT "submission_key_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
