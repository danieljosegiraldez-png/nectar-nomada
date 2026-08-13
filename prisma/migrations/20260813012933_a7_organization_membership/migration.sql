-- CreateEnum
CREATE TYPE "core"."MembershipStatus" AS ENUM ('active', 'ended');

-- CreateTable
CREATE TABLE "core"."organization_membership" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "status" "core"."MembershipStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "organization_membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_membership_person_id_idx" ON "core"."organization_membership"("person_id");

-- CreateIndex
CREATE INDEX "organization_membership_organization_id_idx" ON "core"."organization_membership"("organization_id");

-- AddForeignKey
ALTER TABLE "core"."organization_membership" ADD CONSTRAINT "organization_membership_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "core"."person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."organization_membership" ADD CONSTRAINT "organization_membership_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."organization_membership" ADD CONSTRAINT "organization_membership_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
