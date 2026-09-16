-- `ADD VALUE` corre dentro de la transacción mientras el valor no se USE aquí.
ALTER TYPE "core"."LocationType" ADD VALUE 'drying_facility';
ALTER TYPE "core"."LocationType" ADD VALUE 'drying_bed';

CREATE TYPE "core"."DryingEnvironment" AS ENUM (
  'solar_greenhouse', 'dark_room_climate_controlled',
  'open_patio', 'covered_patio', 'mechanical_dryer'
);

ALTER TABLE "core"."location"
  ADD COLUMN "drying_environment" "core"."DryingEnvironment",
  ADD COLUMN "rack_level" INTEGER;

-- Un nivel de rack de 0 o negativo no existe. Misma fila, así que CHECK basta.
ALTER TABLE "core"."location"
  ADD CONSTRAINT "location_rack_level_positivo"
    CHECK ("rack_level" IS NULL OR "rack_level" > 0);
