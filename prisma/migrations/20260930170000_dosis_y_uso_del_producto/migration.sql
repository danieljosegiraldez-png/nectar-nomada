-- Para qué se usa un producto fitosanitario: prevenir o controlar.
-- Decisión de Daniel, 2026-09-30, con sus palabras: Bralic y Beauveria son preventivos;
-- Regent y Abamectina son de control y «no se usan para prevenir con frecuencia».
-- CreateEnum
CREATE TYPE "traceability"."PlantProtectionUse" AS ENUM ('preventivo', 'control');

-- Los cuatro datos cuelgan del PRODUCTO, no de cada aplicación: no cambian entre una y otra.
-- La dosis va en RANGO porque las etiquetas dan mínimo y máximo, y por LITRO DE AGUA, que es como
-- viene en la etiqueta y lo que permite multiplicar por el `mix_volume` que la intervención guarda.
-- AlterTable
ALTER TABLE "traceability"."consumable_material"
  ADD COLUMN "plant_protection_use" "traceability"."PlantProtectionUse",
  ADD COLUMN "dose_min" DECIMAL(12,4),
  ADD COLUMN "dose_max" DECIMAL(12,4),
  ADD COLUMN "dose_unit" TEXT,
  ADD COLUMN "plant_protection_targets" "traceability"."PlotInterventionTarget"[] DEFAULT ARRAY[]::"traceability"."PlotInterventionTarget"[];

-- Un rango al revés no es un rango. No se exige que estén los dos: declarar sólo el máximo es
-- legítimo mientras nadie haya medido el mínimo, y el modelo prefiere que lo que falta se quede
-- faltando antes que inventarlo.
ALTER TABLE "traceability"."consumable_material"
  ADD CONSTRAINT "consumable_material_dose_range_check"
  CHECK ("dose_min" IS NULL OR "dose_max" IS NULL OR "dose_min" <= "dose_max");

-- Una dosis negativa no existe.
ALTER TABLE "traceability"."consumable_material"
  ADD CONSTRAINT "consumable_material_dose_positive_check"
  CHECK (("dose_min" IS NULL OR "dose_min" >= 0) AND ("dose_max" IS NULL OR "dose_max" >= 0));
