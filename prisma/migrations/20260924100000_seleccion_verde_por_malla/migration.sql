CREATE TYPE "traceability"."GreenScreenDataStatus" AS ENUM
  ('measured', 'supplier_declared', 'qualitative', 'unknown');

ALTER TABLE "traceability"."lot"
  ADD COLUMN "green_screen_min" INTEGER,
  ADD COLUMN "green_screen_max" INTEGER,
  ADD COLUMN "green_screen_system" TEXT,
  ADD COLUMN "green_screen_status" "traceability"."GreenScreenDataStatus",
  ADD COLUMN "green_grade_note" TEXT,
  ADD COLUMN "green_uniformity_pct" DECIMAL(5,2);

ALTER TABLE "traceability"."lot"
  ADD CONSTRAINT "lot_green_screen_range_check"
  CHECK (
    ("green_screen_min" IS NULL OR "green_screen_min" BETWEEN 1 AND 30)
    AND ("green_screen_max" IS NULL OR "green_screen_max" BETWEEN 1 AND 30)
    AND ("green_screen_min" IS NULL OR "green_screen_max" IS NULL OR "green_screen_min" <= "green_screen_max")
  ),
  ADD CONSTRAINT "lot_green_uniformity_pct_check"
  CHECK ("green_uniformity_pct" IS NULL OR "green_uniformity_pct" BETWEEN 0 AND 100);
