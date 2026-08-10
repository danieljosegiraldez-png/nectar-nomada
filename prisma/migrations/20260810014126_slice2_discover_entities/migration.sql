-- AlterTable
ALTER TABLE "core"."location" ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "core"."project" ADD COLUMN     "slug" TEXT;

-- CreateTable
CREATE TABLE "core"."story" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body_markdown" TEXT,
    "project_id" UUID,
    "location_id" UUID,
    "organization_id" UUID,
    "author_person_id" UUID,
    "status" "core"."RecordStatus" NOT NULL DEFAULT 'draft',
    "classification" "core"."ClassificationLevel" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."product" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "price_amount" DECIMAL(10,2),
    "price_currency" TEXT,
    "project_id" UUID,
    "location_id" UUID,
    "organization_id" UUID,
    "status" "core"."RecordStatus" NOT NULL DEFAULT 'draft',
    "classification" "core"."ClassificationLevel" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."experience" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "price_amount" DECIMAL(10,2),
    "price_currency" TEXT,
    "duration_minutes" INTEGER,
    "project_id" UUID,
    "location_id" UUID,
    "organization_id" UUID,
    "status" "core"."RecordStatus" NOT NULL DEFAULT 'draft',
    "classification" "core"."ClassificationLevel" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "experience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "story_slug_key" ON "core"."story"("slug");

-- CreateIndex
CREATE INDEX "story_project_id_idx" ON "core"."story"("project_id");

-- CreateIndex
CREATE INDEX "story_location_id_idx" ON "core"."story"("location_id");

-- CreateIndex
CREATE INDEX "story_organization_id_idx" ON "core"."story"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_slug_key" ON "core"."product"("slug");

-- CreateIndex
CREATE INDEX "product_project_id_idx" ON "core"."product"("project_id");

-- CreateIndex
CREATE INDEX "product_location_id_idx" ON "core"."product"("location_id");

-- CreateIndex
CREATE INDEX "product_organization_id_idx" ON "core"."product"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "experience_slug_key" ON "core"."experience"("slug");

-- CreateIndex
CREATE INDEX "experience_project_id_idx" ON "core"."experience"("project_id");

-- CreateIndex
CREATE INDEX "experience_location_id_idx" ON "core"."experience"("location_id");

-- CreateIndex
CREATE INDEX "experience_organization_id_idx" ON "core"."experience"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_slug_key" ON "core"."location"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "project_slug_key" ON "core"."project"("slug");

-- AddForeignKey
ALTER TABLE "core"."story" ADD CONSTRAINT "story_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."story" ADD CONSTRAINT "story_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."story" ADD CONSTRAINT "story_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."story" ADD CONSTRAINT "story_author_person_id_fkey" FOREIGN KEY ("author_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."story" ADD CONSTRAINT "story_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."product" ADD CONSTRAINT "product_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."product" ADD CONSTRAINT "product_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."product" ADD CONSTRAINT "product_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."product" ADD CONSTRAINT "product_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."experience" ADD CONSTRAINT "experience_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."experience" ADD CONSTRAINT "experience_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."experience" ADD CONSTRAINT "experience_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."experience" ADD CONSTRAINT "experience_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

