CREATE TYPE "traceability"."TrapCaptureLevel" AS ENUM ('ninguno', 'pocos', 'algunos', 'muchos');

CREATE TABLE "traceability"."plot_block" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "plot_block_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plot_block_location_id_name_key" ON "traceability"."plot_block"("location_id", "name");
CREATE INDEX "plot_block_location_id_idx" ON "traceability"."plot_block"("location_id");

ALTER TABLE "traceability"."plot_block"
  ADD CONSTRAINT "plot_block_location_id_fkey" FOREIGN KEY ("location_id")
  REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "plot_block_created_by_fkey" FOREIGN KEY ("created_by")
  REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "traceability"."specimen"
  ADD COLUMN "plot_block_id" UUID,
  ADD COLUMN "farm_location_id" UUID,
  ADD COLUMN "trap_number" INTEGER;

CREATE UNIQUE INDEX "specimen_farm_location_id_trap_number_key"
  ON "traceability"."specimen"("farm_location_id", "trap_number");

ALTER TABLE "traceability"."specimen"
  ADD CONSTRAINT "specimen_plot_block_id_fkey" FOREIGN KEY ("plot_block_id")
  REFERENCES "traceability"."plot_block"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "specimen_farm_location_id_fkey" FOREIGN KEY ("farm_location_id")
  REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "traceability"."specimen_observation"
  ADD COLUMN "broca_level" "traceability"."TrapCaptureLevel",
  ADD COLUMN "other_insects" BOOLEAN,
  ADD COLUMN "other_insects_note" TEXT,
  ADD COLUMN "cleaned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "liquid_changed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lure_recharged" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "core"."asset" ADD COLUMN "specimen_observation_id" UUID;
CREATE INDEX "asset_specimen_observation_id_idx" ON "core"."asset"("specimen_observation_id");
ALTER TABLE "core"."asset"
  ADD CONSTRAINT "asset_specimen_observation_id_fkey" FOREIGN KEY ("specimen_observation_id")
  REFERENCES "traceability"."specimen_observation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
