CREATE TYPE "core"."MaterialState" AS ENUM ('CHERRY','MUCILAGE_HONEY','PARCHMENT','GREEN');
CREATE TYPE "core"."SamplingRole"  AS ENUM ('ZONE','REPLICATE');
CREATE TYPE "core"."SampleKind"    AS ENUM ('PROCESS','MOISTURE','ROAST','CUPPING','RETENTION');
CREATE TYPE "core"."SamplingZone"  AS ENUM ('NORTH','SOUTH','EAST','WEST','CENTER','EDGE');

ALTER TABLE "core"."sample"
  ADD COLUMN "sample_kind"      "core"."SampleKind",
  ADD COLUMN "material_state"   "core"."MaterialState",
  ADD COLUMN "sampling_role"    "core"."SamplingRole",
  ADD COLUMN "sampling_zone"    "core"."SamplingZone",
  ADD COLUMN "sampling_zone_note" TEXT,
  ADD COLUMN "stage_at_extraction" TEXT,
  ADD COLUMN "mass_at_extraction" DECIMAL(12,4),
  ADD COLUMN "mass_unit_at_extraction" TEXT,
  ADD COLUMN "moisture_pct_at_extraction" DECIMAL(5,2);

-- Una zona sin papel declarado no significa nada, y un papel de réplica con
-- zona se contradice. Misma fila: CHECK basta.
ALTER TABLE "core"."sample"
  ADD CONSTRAINT "sample_zona_exige_papel_zona"
    CHECK ("sampling_zone" IS NULL OR ("sampling_role" IS NOT NULL AND "sampling_role" = 'ZONE'));

-- Una masa sin unidad es un número sin significado.
ALTER TABLE "core"."sample"
  ADD CONSTRAINT "sample_masa_con_unidad"
    CHECK (("mass_at_extraction" IS NULL) = ("mass_unit_at_extraction" IS NULL));
