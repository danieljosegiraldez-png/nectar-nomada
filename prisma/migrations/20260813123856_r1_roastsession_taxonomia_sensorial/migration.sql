-- CreateEnum
CREATE TYPE "sensory"."SensoryDescriptorClassification" AS ENUM ('positive', 'neutral', 'defect');

-- CreateEnum
CREATE TYPE "sensory"."SensoryConfidenceLevel" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "traceability"."lot_transformation" ADD COLUMN     "roast_session_id" UUID;

-- AlterTable
ALTER TABLE "traceability"."measurement" ADD COLUMN     "roast_session_id" UUID;

-- CreateTable
CREATE TABLE "sensory"."sensory_descriptor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "protocol_version_id" UUID NOT NULL,
    "family" TEXT NOT NULL,
    "specific_descriptor" TEXT NOT NULL,
    "expected_perception" TEXT,
    "classification" "sensory"."SensoryDescriptorClassification" NOT NULL,
    "technical_cause" TEXT,
    "display_order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensory_descriptor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensory"."sensory_descriptor_response" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assessment_id" UUID NOT NULL,
    "descriptor_id" UUID NOT NULL,
    "confidence" "sensory"."SensoryConfidenceLevel",
    "comment" TEXT,

    CONSTRAINT "sensory_descriptor_response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."roast_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roast_level" TEXT,
    "equipment_note" TEXT,
    "roaster_person_id" UUID,
    "charge_weight_kg" DECIMAL(10,3),
    "discharge_weight_kg" DECIMAL(10,3),
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "first_crack_at" TIMESTAMP(3),
    "second_crack_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "roast_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sensory_descriptor_protocol_version_id_idx" ON "sensory"."sensory_descriptor"("protocol_version_id");

-- CreateIndex
CREATE INDEX "sensory_descriptor_response_assessment_id_idx" ON "sensory"."sensory_descriptor_response"("assessment_id");

-- CreateIndex
CREATE INDEX "sensory_descriptor_response_descriptor_id_idx" ON "sensory"."sensory_descriptor_response"("descriptor_id");

-- CreateIndex
CREATE UNIQUE INDEX "sensory_descriptor_response_assessment_id_descriptor_id_key" ON "sensory"."sensory_descriptor_response"("assessment_id", "descriptor_id");

-- CreateIndex
CREATE INDEX "roast_session_roaster_person_id_idx" ON "traceability"."roast_session"("roaster_person_id");

-- CreateIndex
CREATE INDEX "measurement_roast_session_id_idx" ON "traceability"."measurement"("roast_session_id");

-- AddForeignKey
ALTER TABLE "sensory"."sensory_descriptor" ADD CONSTRAINT "sensory_descriptor_protocol_version_id_fkey" FOREIGN KEY ("protocol_version_id") REFERENCES "sensory"."sensory_protocol_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."sensory_descriptor_response" ADD CONSTRAINT "sensory_descriptor_response_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "sensory"."assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensory"."sensory_descriptor_response" ADD CONSTRAINT "sensory_descriptor_response_descriptor_id_fkey" FOREIGN KEY ("descriptor_id") REFERENCES "sensory"."sensory_descriptor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lot_transformation" ADD CONSTRAINT "lot_transformation_roast_session_id_fkey" FOREIGN KEY ("roast_session_id") REFERENCES "traceability"."roast_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."measurement" ADD CONSTRAINT "measurement_roast_session_id_fkey" FOREIGN KEY ("roast_session_id") REFERENCES "traceability"."roast_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."roast_session" ADD CONSTRAINT "roast_session_roaster_person_id_fkey" FOREIGN KEY ("roaster_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."roast_session" ADD CONSTRAINT "roast_session_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
