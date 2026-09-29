-- El ritmo por fase: los objetivos de receta dicen de qué fase hablan, y una receta puede declarar
-- por fase cuánto debe durar, cada cuánto se voltea y a qué humedad se quiere llegar.
--
-- Diseño: docs/superpowers/specs/2026-09-27-cola-de-secado-y-ritmo-por-fase-design.md, decisión 1.
--
-- SOBRE EL RELLENO DE `phase` EN LO QUE YA EXISTE. La tentación era poner `fermentation` en todo,
-- «porque es la única fase que tenía receta». Es un supuesto: una `process_recipe_version` puede
-- estar referenciada por un TUESTE (`roast_session`) o por un perfil de tueste
-- (`lot_roast_profile`), y entonces sería falso. Así que esta migración no supone: rellena
-- `fermentation` SÓLO donde ninguna de esas dos tablas referencia la versión, y deja nulo lo demás.
-- Nulo significa «no dice de qué fase habla», que es la verdad.
--
-- La misma condición la imprime `npm run data:medir-fases` antes de aplicar nada, lote por lote.
--
-- Y NO pone la columna obligatoria a propósito: las migraciones corren solas en cada despliegue, así
-- que una que pueda fallar con los datos de producción tumbaría el despliegue. Se prefiere un nulo
-- visible a un despliegue roto o a un dato inventado.

-- CreateEnum
CREATE TYPE "traceability"."ProcessPhase" AS ENUM ('fermentation', 'drying');

-- DropIndex
DROP INDEX "traceability"."process_target_recipe_version_id_variable_moment_key";

-- AlterTable
ALTER TABLE "traceability"."process_target" ADD COLUMN     "phase" "traceability"."ProcessPhase";

-- CreateTable
CREATE TABLE "traceability"."process_recipe_phase" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipe_version_id" UUID NOT NULL,
    "phase" "traceability"."ProcessPhase" NOT NULL,
    "expected_hours" INTEGER,
    "turn_every_hours" INTEGER,
    "target_moisture_min_pct" DECIMAL(5,2),
    "target_moisture_max_pct" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "process_recipe_phase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "process_recipe_phase_recipe_version_id_idx" ON "traceability"."process_recipe_phase"("recipe_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "process_recipe_phase_recipe_version_id_phase_key" ON "traceability"."process_recipe_phase"("recipe_version_id", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "process_target_recipe_version_id_phase_variable_moment_key" ON "traceability"."process_target"("recipe_version_id", "phase", "variable", "moment");

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_phase" ADD CONSTRAINT "process_recipe_phase_recipe_version_id_fkey" FOREIGN KEY ("recipe_version_id") REFERENCES "traceability"."process_recipe_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Relleno condicional. Ver la cabecera: sólo donde ningún tueste toca la versión.
UPDATE "traceability"."process_target" t
   SET "phase" = 'fermentation'
 WHERE t."phase" IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM "traceability"."roast_session" rs WHERE rs."recipe_version_id" = t."recipe_version_id"
   )
   AND NOT EXISTS (
     SELECT 1 FROM "traceability"."lot_roast_profile" rp WHERE rp."recipe_version_id" = t."recipe_version_id"
   );
