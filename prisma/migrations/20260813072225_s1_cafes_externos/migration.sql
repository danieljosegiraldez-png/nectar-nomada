-- CreateEnum
CREATE TYPE "core"."HarvestWindowPrecision" AS ENUM ('year', 'month', 'date');

-- CreateTable
CREATE TABLE "core"."external_coffee_origin" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sample_id" UUID NOT NULL,
    "producer_organization_id" UUID,
    "processor_organization_id" UUID,
    "brand_organization_id" UUID,
    "declared_provenance_class" "core"."ProvenanceClass" NOT NULL,
    "source_reference" TEXT,
    "declared_varietal" TEXT,
    "varietal_data_quality" "core"."DataQuality",
    "varietal_known_at" TIMESTAMP(3),
    "declared_process" TEXT,
    "process_data_quality" "core"."DataQuality",
    "process_known_at" TIMESTAMP(3),
    "harvest_window_precision" "core"."HarvestWindowPrecision",
    "harvest_year" INTEGER,
    "harvest_month" INTEGER,
    "harvest_day" INTEGER,
    "harvest_window_data_quality" "core"."DataQuality",
    "harvest_window_known_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "external_coffee_origin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_coffee_origin_sample_id_key" ON "core"."external_coffee_origin"("sample_id");

-- CreateIndex
CREATE INDEX "external_coffee_origin_producer_organization_id_idx" ON "core"."external_coffee_origin"("producer_organization_id");

-- CreateIndex
CREATE INDEX "external_coffee_origin_processor_organization_id_idx" ON "core"."external_coffee_origin"("processor_organization_id");

-- CreateIndex
CREATE INDEX "external_coffee_origin_brand_organization_id_idx" ON "core"."external_coffee_origin"("brand_organization_id");

-- AddForeignKey
ALTER TABLE "core"."external_coffee_origin" ADD CONSTRAINT "external_coffee_origin_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "core"."sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."external_coffee_origin" ADD CONSTRAINT "external_coffee_origin_producer_organization_id_fkey" FOREIGN KEY ("producer_organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."external_coffee_origin" ADD CONSTRAINT "external_coffee_origin_processor_organization_id_fkey" FOREIGN KEY ("processor_organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."external_coffee_origin" ADD CONSTRAINT "external_coffee_origin_brand_organization_id_fkey" FOREIGN KEY ("brand_organization_id") REFERENCES "core"."organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."external_coffee_origin" ADD CONSTRAINT "external_coffee_origin_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
