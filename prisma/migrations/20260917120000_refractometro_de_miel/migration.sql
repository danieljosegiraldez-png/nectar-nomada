-- ADR-160 -- el refractometro de miel. La lectura va como Measurement sobre el Lot de miel;
-- aqui solo cambia lo que el MODO del aparato puede declarar.

-- AlterEnum
ALTER TYPE "core"."MaterialState" ADD VALUE 'BEE_HONEY';

-- AlterTable
ALTER TABLE "core"."instrument_measurement_mode" ADD COLUMN     "variable" TEXT;


-- Un modo que declara variable no la declara vacia. El vocabulario vive en units.ts
-- (isKnownVariable): repetirlo aqui seria una segunda lista que deriva.
ALTER TABLE "core"."instrument_measurement_mode" ADD CONSTRAINT "instrument_mode_variable_no_vacia" CHECK ("variable" IS NULL OR btrim("variable") <> '');
