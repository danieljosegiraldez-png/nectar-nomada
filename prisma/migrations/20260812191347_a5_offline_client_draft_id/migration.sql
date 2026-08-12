-- AlterTable
ALTER TABLE "apiary"."inspection" ADD COLUMN     "client_draft_id" TEXT;

-- AlterTable
ALTER TABLE "apiary"."colony_event" ADD COLUMN     "client_draft_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "inspection_client_draft_id_key" ON "apiary"."inspection"("client_draft_id");

-- CreateIndex
CREATE UNIQUE INDEX "colony_event_client_draft_id_key" ON "apiary"."colony_event"("client_draft_id");
