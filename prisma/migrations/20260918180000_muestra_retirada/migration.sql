-- Decisión de Daniel, 2026-09-18: una muestra se retira, nunca se borra ni se
-- edita en su sitio. docs/superpowers/specs/2026-09-18-muestra-verde-tras-proceso-design.md §6.

-- AlterTable
ALTER TABLE "core"."sample" ADD COLUMN "retired_at" TIMESTAMP(3);
