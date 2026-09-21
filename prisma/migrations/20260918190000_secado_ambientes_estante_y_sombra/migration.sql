-- Paso 2a del spec de secado por bandeja (§4.1). Nombres aprobados por Daniel el
-- 2026-09-18. Los tres ADD VALUE van solos: Postgres no deja USAR un valor de
-- enum en la misma transacción que lo añade, y las reglas del estante (que sí
-- lo usan) van en la migración siguiente.
ALTER TYPE "core"."DryingEnvironment" ADD VALUE 'african_bed_outdoor';
ALTER TYPE "core"."DryingEnvironment" ADD VALUE 'floor_tarp';
ALTER TYPE "core"."LocationType" ADD VALUE 'drying_rack';

-- La sombra de arriba (Daniel, 2026-09-18): QUÉ la da —un árbol, una
-- enredadera, una lona, un techo con cierta opacidad—, en texto libre al lado
-- del grado. El grado es `shade_percentage`, que ya existe y usan las parcelas.
ALTER TABLE "core"."location" ADD COLUMN "shade_description" TEXT;
ALTER TABLE "core"."location"
  ADD CONSTRAINT "location_shade_description_corta"
    CHECK ("shade_description" IS NULL OR char_length("shade_description") <= 300);
