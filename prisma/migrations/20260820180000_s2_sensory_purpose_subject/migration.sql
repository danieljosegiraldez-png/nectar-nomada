-- S2 (docs/implementation/37_S2_PROPOSITO_SENSORIAL_NAVEGACION.md §2).
--
-- Purpose and subject are the two axes that distinguish one evaluation tool
-- from another; the third axis, role, is already RBAC's job and is not
-- modelled here.
--
-- Both columns are NULLABLE and neither is backfilled. §6 forbids classifying
-- an existing evaluation automatically: deducing what a past session was FOR
-- is exactly the interpretation provenance rules prohibit. Six sessions
-- predate this migration and stay null until a human declares them.
--
-- Written by hand rather than by `prisma migrate dev`, because the shadow
-- database that command builds replays every migration from empty and cannot
-- get past 20260813112712_ro1_statistical_discipline — the ordering bug filed
-- in docs/implementation/39_MIGRATION_HISTORY_ORDERING_BUG.md, which that
-- ticket says not to fix without an explicit decision. SQL generated with
-- `prisma migrate diff --from-config-datasource --to-schema`, which diffs
-- against a live database and needs no replay.

-- CreateEnum
CREATE TYPE "sensory"."SensoryPurpose" AS ENUM ('rank', 'verify_conformance', 'characterize', 'select', 'hedonic');

-- CreateEnum
CREATE TYPE "sensory"."SensorySubject" AS ENUM ('raw_material_in_process', 'intermediate_product', 'prepared_beverage');

-- AlterTable
ALTER TABLE "sensory"."sensory_session" ADD COLUMN     "preparation_method" TEXT,
ADD COLUMN     "purpose" "sensory"."SensoryPurpose",
ADD COLUMN     "subject" "sensory"."SensorySubject";
