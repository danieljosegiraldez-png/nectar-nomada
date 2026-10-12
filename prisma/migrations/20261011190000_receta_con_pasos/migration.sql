-- Parte 2a (2026-10-03): la receta con pasos.
-- docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md, §3, §3.2, §4.1, §5.2, §5.3
-- y su §12; nombres fijados en .superpowers/plan-2a/esqueleto.md.
--
-- **Sin recuento que aborte, y por qué.** Ninguna restricción nueva puede chocar con una fila de hoy:
-- las columnas nuevas nacen nulas o con su valor por defecto; `lot_process_intervention` sólo pierde
-- su NOT NULL, y toda fila de hoy tiene catálogo; el índice parcial de las metas sin paso cubre las
-- MISMAS columnas que el único que reemplaza, sobre las mismas filas (todas tienen `recipe_step_id`
-- nulo); y `process_recipe.organization_id` pasa de SET NULL a RESTRICT, que sólo cambia lo que ocurre
-- AL BORRAR una organización, no lo que ya hay. Es lo contrario de `20261004100000_proceso_cubre_al_lote`,
-- que sí tenía que contar.
--
-- **Lo que Prisma no ve.** Los CHECK y los dos índices únicos PARCIALES de `process_target` viven sólo
-- aquí; `schema.prisma` los nombra en prosa junto a cada campo. El resto de este archivo es,
-- sentencia por sentencia, lo que `prisma migrate diff` pide para el esquema nuevo, y
-- `tests/derivaDeMigraciones.test.ts` lo vigila.

-- CreateEnum
CREATE TYPE "traceability"."StepEndRule" AS ENUM ('first', 'all');

-- CreateEnum
CREATE TYPE "traceability"."StepEndOperator" AS ENUM ('gte', 'lte');

-- CreateEnum
CREATE TYPE "traceability"."AdditionMoment" AS ENUM ('pre_green', 'post_green');

-- Ruling FK-ORG (registro de la 2a, 2026-10-04): borrar una organización convertía en silencio sus
-- recetas en plantillas de todas (`ON DELETE SET NULL`), y desde la 2a una plantilla significa algo. La
-- misma clave, con el mismo nombre, pasa a RESTRICT: se vuelve a poner más abajo, entre las claves ajenas.
-- DropForeignKey
ALTER TABLE "traceability"."process_recipe" DROP CONSTRAINT "process_recipe_organization_id_fkey";

-- §3.2: la unicidad de las metas pasa a dos índices parciales (abajo). Se quita el único de siempre.
-- DropIndex
DROP INDEX "traceability"."process_target_recipe_version_id_phase_variable_moment_key";

-- AlterTable
ALTER TABLE "traceability"."fermentation_run" ADD COLUMN     "motivo_desviacion" TEXT,
ADD COLUMN     "recipe_step_id" UUID,
ADD COLUMN     "step_type_value_id" UUID;

-- AlterTable
ALTER TABLE "traceability"."lot_process" ADD COLUMN     "origen_de_receta_version_id" UUID;

-- AlterTable
ALTER TABLE "traceability"."lot_process_intervention" ADD COLUMN     "motivo_desviacion" TEXT,
ADD COLUMN     "recipe_step_id" UUID,
ADD COLUMN     "step_type_value_id" UUID,
ALTER COLUMN "catalog_value_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "traceability"."process_recipe" ADD COLUMN     "derivada_de_version_id" UUID,
ADD COLUMN     "es_libre" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "motivo_de_libre" TEXT,
ADD COLUMN     "parecida_a_version_id" UUID;

-- AlterTable
ALTER TABLE "traceability"."process_target" ADD COLUMN     "recipe_step_id" UUID;

-- AlterTable
ALTER TABLE "traceability"."fermentation_intervention" ADD COLUMN     "motivo_desviacion" TEXT,
ADD COLUMN     "recipe_step_id" UUID,
ADD COLUMN     "step_type_value_id" UUID;

-- AlterTable
ALTER TABLE "traceability"."drying_run" ADD COLUMN     "motivo_desviacion" TEXT,
ADD COLUMN     "recipe_step_id" UUID,
ADD COLUMN     "step_type_value_id" UUID;

-- CreateTable
CREATE TABLE "traceability"."process_recipe_step" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipe_version_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "step_type_value_id" UUID NOT NULL,
    "intencion" TEXT,
    "opcional" BOOLEAN NOT NULL DEFAULT false,
    "estado_fruto_value_id" UUID,
    "mucilago_objetivo" INTEGER,
    "oxigeno_value_id" UUID,
    "temperatura_value_id" UUID,
    "temperatura_min_c" DECIMAL(5,2),
    "temperatura_max_c" DECIMAL(5,2),
    "fuente_microbiana_value_id" UUID,
    "medio_value_id" UUID,
    "fisico_value_id" UUID,
    "modo_secado" "core"."DryingEnvironment",
    "horas_min" INTEGER,
    "horas_sugeridas" INTEGER,
    "horas_max" INTEGER,
    "volteo_cada_horas" INTEGER,
    "humedad_min_pct" DECIMAL(5,2),
    "humedad_max_pct" DECIMAL(5,2),
    "fin_por_tiempo" BOOLEAN NOT NULL DEFAULT false,
    "regla_de_fin" "traceability"."StepEndRule" NOT NULL DEFAULT 'first',

    CONSTRAINT "process_recipe_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."process_recipe_step_addition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "step_id" UUID NOT NULL,
    "categoria_value_id" UUID NOT NULL,
    "cantidad" DECIMAL(12,4),
    "unidad" TEXT,
    "momento" "traceability"."AdditionMoment" NOT NULL,

    CONSTRAINT "process_recipe_step_addition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."process_recipe_step_end" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "step_id" UUID NOT NULL,
    "variable" TEXT NOT NULL,
    "operador" "traceability"."StepEndOperator" NOT NULL,
    "valor" DECIMAL(12,4) NOT NULL,
    "unidad" TEXT NOT NULL,
    "desde_lectura_id" UUID,

    CONSTRAINT "process_recipe_step_end_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."process_recipe_step_requirement" (
    "step_id" UUID NOT NULL,
    "capacidad_value_id" UUID NOT NULL,

    CONSTRAINT "process_recipe_step_requirement_pkey" PRIMARY KEY ("step_id","capacidad_value_id")
);

-- CreateTable
CREATE TABLE "traceability"."process_step_closing_reading" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "measurement_id" UUID NOT NULL,
    "fermentation_run_id" UUID,
    "drying_run_id" UUID,
    "lot_process_intervention_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "process_step_closing_reading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "process_recipe_step_recipe_version_id_idx" ON "traceability"."process_recipe_step"("recipe_version_id");

-- CreateIndex
CREATE INDEX "process_recipe_step_step_type_value_id_idx" ON "traceability"."process_recipe_step"("step_type_value_id");

-- CreateIndex
CREATE INDEX "process_recipe_step_estado_fruto_value_id_idx" ON "traceability"."process_recipe_step"("estado_fruto_value_id");

-- CreateIndex
CREATE INDEX "process_recipe_step_oxigeno_value_id_idx" ON "traceability"."process_recipe_step"("oxigeno_value_id");

-- CreateIndex
CREATE INDEX "process_recipe_step_temperatura_value_id_idx" ON "traceability"."process_recipe_step"("temperatura_value_id");

-- CreateIndex
CREATE INDEX "process_recipe_step_fuente_microbiana_value_id_idx" ON "traceability"."process_recipe_step"("fuente_microbiana_value_id");

-- CreateIndex
CREATE INDEX "process_recipe_step_medio_value_id_idx" ON "traceability"."process_recipe_step"("medio_value_id");

-- CreateIndex
CREATE INDEX "process_recipe_step_fisico_value_id_idx" ON "traceability"."process_recipe_step"("fisico_value_id");

-- CreateIndex
CREATE UNIQUE INDEX "process_recipe_step_recipe_version_id_seq_key" ON "traceability"."process_recipe_step"("recipe_version_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "process_recipe_step_id_recipe_version_id_key" ON "traceability"."process_recipe_step"("id", "recipe_version_id");

-- CreateIndex
CREATE INDEX "process_recipe_step_addition_step_id_idx" ON "traceability"."process_recipe_step_addition"("step_id");

-- CreateIndex
CREATE INDEX "process_recipe_step_addition_categoria_value_id_idx" ON "traceability"."process_recipe_step_addition"("categoria_value_id");

-- CreateIndex
CREATE INDEX "process_recipe_step_end_step_id_idx" ON "traceability"."process_recipe_step_end"("step_id");

-- CreateIndex
CREATE INDEX "process_recipe_step_end_desde_lectura_id_idx" ON "traceability"."process_recipe_step_end"("desde_lectura_id");

-- CreateIndex
CREATE INDEX "process_recipe_step_requirement_capacidad_value_id_idx" ON "traceability"."process_recipe_step_requirement"("capacidad_value_id");

-- CreateIndex
CREATE INDEX "process_step_closing_reading_fermentation_run_id_idx" ON "traceability"."process_step_closing_reading"("fermentation_run_id");

-- CreateIndex
CREATE INDEX "process_step_closing_reading_drying_run_id_idx" ON "traceability"."process_step_closing_reading"("drying_run_id");

-- CreateIndex
CREATE INDEX "process_step_closing_reading_lot_process_intervention_id_idx" ON "traceability"."process_step_closing_reading"("lot_process_intervention_id");

-- CreateIndex
CREATE UNIQUE INDEX "process_step_closing_reading_measurement_id_fermentation_ru_key" ON "traceability"."process_step_closing_reading"("measurement_id", "fermentation_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "process_step_closing_reading_measurement_id_drying_run_id_key" ON "traceability"."process_step_closing_reading"("measurement_id", "drying_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "process_step_closing_reading_measurement_id_lot_process_int_key" ON "traceability"."process_step_closing_reading"("measurement_id", "lot_process_intervention_id");

-- CreateIndex
CREATE INDEX "fermentation_run_step_type_value_id_idx" ON "traceability"."fermentation_run"("step_type_value_id");

-- CreateIndex
CREATE INDEX "fermentation_run_recipe_step_id_idx" ON "traceability"."fermentation_run"("recipe_step_id");

-- CreateIndex
CREATE INDEX "lot_process_origen_de_receta_version_id_idx" ON "traceability"."lot_process"("origen_de_receta_version_id");

-- CreateIndex
CREATE INDEX "lot_process_intervention_step_type_value_id_idx" ON "traceability"."lot_process_intervention"("step_type_value_id");

-- CreateIndex
CREATE INDEX "lot_process_intervention_recipe_step_id_idx" ON "traceability"."lot_process_intervention"("recipe_step_id");

-- CreateIndex
CREATE INDEX "process_recipe_derivada_de_version_id_idx" ON "traceability"."process_recipe"("derivada_de_version_id");

-- CreateIndex
CREATE INDEX "process_recipe_parecida_a_version_id_idx" ON "traceability"."process_recipe"("parecida_a_version_id");

-- CreateIndex
CREATE INDEX "process_target_recipe_step_id_recipe_version_id_idx" ON "traceability"."process_target"("recipe_step_id", "recipe_version_id");

-- CreateIndex
CREATE INDEX "fermentation_intervention_step_type_value_id_idx" ON "traceability"."fermentation_intervention"("step_type_value_id");

-- CreateIndex
CREATE INDEX "fermentation_intervention_recipe_step_id_idx" ON "traceability"."fermentation_intervention"("recipe_step_id");

-- CreateIndex
CREATE INDEX "drying_run_step_type_value_id_idx" ON "traceability"."drying_run"("step_type_value_id");

-- CreateIndex
CREATE INDEX "drying_run_recipe_step_id_idx" ON "traceability"."drying_run"("recipe_step_id");

-- AddForeignKey
ALTER TABLE "traceability"."fermentation_run" ADD CONSTRAINT "fermentation_run_step_type_value_id_fkey" FOREIGN KEY ("step_type_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."fermentation_run" ADD CONSTRAINT "fermentation_run_recipe_step_id_fkey" FOREIGN KEY ("recipe_step_id") REFERENCES "traceability"."process_recipe_step"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lot_process" ADD CONSTRAINT "lot_process_origen_de_receta_version_id_fkey" FOREIGN KEY ("origen_de_receta_version_id") REFERENCES "traceability"."process_recipe_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lot_process_intervention" ADD CONSTRAINT "lot_process_intervention_step_type_value_id_fkey" FOREIGN KEY ("step_type_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lot_process_intervention" ADD CONSTRAINT "lot_process_intervention_recipe_step_id_fkey" FOREIGN KEY ("recipe_step_id") REFERENCES "traceability"."process_recipe_step"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ruling FK-ORG: la que se quitó arriba, ahora RESTRICT.
-- AddForeignKey
ALTER TABLE "traceability"."process_recipe" ADD CONSTRAINT "process_recipe_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe" ADD CONSTRAINT "process_recipe_derivada_de_version_id_fkey" FOREIGN KEY ("derivada_de_version_id") REFERENCES "traceability"."process_recipe_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe" ADD CONSTRAINT "process_recipe_parecida_a_version_id_fkey" FOREIGN KEY ("parecida_a_version_id") REFERENCES "traceability"."process_recipe_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- §3.2: la meta y su paso son de la MISMA versión, y lo exige la base. Compuesta: `recipe_version_id`
-- es a la vez la clave de la meta hacia su versión y la mitad de ésta (precedente: la rueda sensorial,
-- `sensory_wheel_node_version_id_parent_id_parent_level_fkey`). MATCH SIMPLE, el de siempre: con
-- `recipe_step_id` nulo no se comprueba nada, que es una meta de la versión.
-- AddForeignKey
ALTER TABLE "traceability"."process_target" ADD CONSTRAINT "process_target_recipe_step_id_recipe_version_id_fkey" FOREIGN KEY ("recipe_step_id", "recipe_version_id") REFERENCES "traceability"."process_recipe_step"("id", "recipe_version_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_step" ADD CONSTRAINT "process_recipe_step_recipe_version_id_fkey" FOREIGN KEY ("recipe_version_id") REFERENCES "traceability"."process_recipe_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_step" ADD CONSTRAINT "process_recipe_step_step_type_value_id_fkey" FOREIGN KEY ("step_type_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_step" ADD CONSTRAINT "process_recipe_step_estado_fruto_value_id_fkey" FOREIGN KEY ("estado_fruto_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_step" ADD CONSTRAINT "process_recipe_step_oxigeno_value_id_fkey" FOREIGN KEY ("oxigeno_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_step" ADD CONSTRAINT "process_recipe_step_temperatura_value_id_fkey" FOREIGN KEY ("temperatura_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_step" ADD CONSTRAINT "process_recipe_step_fuente_microbiana_value_id_fkey" FOREIGN KEY ("fuente_microbiana_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_step" ADD CONSTRAINT "process_recipe_step_medio_value_id_fkey" FOREIGN KEY ("medio_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_step" ADD CONSTRAINT "process_recipe_step_fisico_value_id_fkey" FOREIGN KEY ("fisico_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_step_addition" ADD CONSTRAINT "process_recipe_step_addition_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "traceability"."process_recipe_step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_step_addition" ADD CONSTRAINT "process_recipe_step_addition_categoria_value_id_fkey" FOREIGN KEY ("categoria_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_step_end" ADD CONSTRAINT "process_recipe_step_end_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "traceability"."process_recipe_step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_step_end" ADD CONSTRAINT "process_recipe_step_end_desde_lectura_id_fkey" FOREIGN KEY ("desde_lectura_id") REFERENCES "traceability"."measurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_step_requirement" ADD CONSTRAINT "process_recipe_step_requirement_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "traceability"."process_recipe_step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_recipe_step_requirement" ADD CONSTRAINT "process_recipe_step_requirement_capacidad_value_id_fkey" FOREIGN KEY ("capacidad_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_step_closing_reading" ADD CONSTRAINT "process_step_closing_reading_measurement_id_fkey" FOREIGN KEY ("measurement_id") REFERENCES "traceability"."measurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_step_closing_reading" ADD CONSTRAINT "process_step_closing_reading_fermentation_run_id_fkey" FOREIGN KEY ("fermentation_run_id") REFERENCES "traceability"."fermentation_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_step_closing_reading" ADD CONSTRAINT "process_step_closing_reading_drying_run_id_fkey" FOREIGN KEY ("drying_run_id") REFERENCES "traceability"."drying_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_step_closing_reading" ADD CONSTRAINT "process_step_closing_reading_lot_process_intervention_id_fkey" FOREIGN KEY ("lot_process_intervention_id") REFERENCES "traceability"."lot_process_intervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."process_step_closing_reading" ADD CONSTRAINT "process_step_closing_reading_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."fermentation_intervention" ADD CONSTRAINT "fermentation_intervention_step_type_value_id_fkey" FOREIGN KEY ("step_type_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."fermentation_intervention" ADD CONSTRAINT "fermentation_intervention_recipe_step_id_fkey" FOREIGN KEY ("recipe_step_id") REFERENCES "traceability"."process_recipe_step"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."drying_run" ADD CONSTRAINT "drying_run_step_type_value_id_fkey" FOREIGN KEY ("step_type_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."drying_run" ADD CONSTRAINT "drying_run_recipe_step_id_fkey" FOREIGN KEY ("recipe_step_id") REFERENCES "traceability"."process_recipe_step"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------------
-- Lo que Prisma no expresa: los dos índices únicos parciales de las metas (§3.2) y los CHECK.
-- ---------------------------------------------------------------------------------------------------

-- §3.2. Las metas de la versión (sin paso) siguen únicas por versión, fase, variable y momento, como
-- hasta hoy; las de un paso, por paso, variable y momento. Así la fiebre y la fermentación de una
-- misma versión piden las dos su pH inicial, y dos secados su humedad final.
CREATE UNIQUE INDEX "process_target_unica_sin_paso" ON "traceability"."process_target"("recipe_version_id", "phase", "variable", "moment") WHERE "recipe_step_id" IS NULL;
CREATE UNIQUE INDEX "process_target_unica_por_paso" ON "traceability"."process_target"("recipe_step_id", "variable", "moment") WHERE "recipe_step_id" IS NOT NULL;

-- §3: el mucílago que QUEDA va en uno de los seis tramos que se ven a ojo y al tacto (decisión de
-- Daniel, 2026-10-03, que corrige ADR-181 #12): 0 = Lavado, 100 = Honey. Sin declarar (NULL) pasa, y es
-- lo que significa «no se declaró». Es `IN`, no `BETWEEN 0 AND 100`: 33 está entre los dos y no es un tramo.
ALTER TABLE "traceability"."process_recipe_step"
  ADD CONSTRAINT "process_recipe_step_mucilago_en_tramos"
  CHECK ("mucilago_objetivo" IN (0, 10, 25, 50, 75, 100));

-- §3: los rangos del paso. Cada par se compara sólo si sus dos extremos están declarados, y se escribe
-- con `IS NULL OR` explícito: una comparación con un nulo vale NULL, y un CHECK que vale NULL PASA.
-- La forma corta `min <= sug AND sug <= max` dejaba entrar mínimo 48 y máximo 24 con la sugerida
-- sin declarar (las dos comparaciones valen NULL).
ALTER TABLE "traceability"."process_recipe_step"
  ADD CONSTRAINT "process_recipe_step_horas_en_orden"
  CHECK (
    ("horas_min" IS NULL OR "horas_sugeridas" IS NULL OR "horas_min" <= "horas_sugeridas")
    AND ("horas_sugeridas" IS NULL OR "horas_max" IS NULL OR "horas_sugeridas" <= "horas_max")
    AND ("horas_min" IS NULL OR "horas_max" IS NULL OR "horas_min" <= "horas_max")
  );
ALTER TABLE "traceability"."process_recipe_step"
  ADD CONSTRAINT "process_recipe_step_humedad_en_orden"
  CHECK ("humedad_min_pct" IS NULL OR "humedad_max_pct" IS NULL OR "humedad_min_pct" <= "humedad_max_pct");
ALTER TABLE "traceability"."process_recipe_step"
  ADD CONSTRAINT "process_recipe_step_temperatura_en_orden"
  CHECK ("temperatura_min_c" IS NULL OR "temperatura_max_c" IS NULL OR "temperatura_min_c" <= "temperatura_max_c");

-- §3 (E): una cantidad sin unidad no se puede leer, y una unidad sin cantidad no dice nada.
ALTER TABLE "traceability"."process_recipe_step_addition"
  ADD CONSTRAINT "process_recipe_step_addition_cantidad_con_unidad"
  CHECK (("cantidad" IS NULL) = ("unidad" IS NULL));

-- §5.3: una marca de cierre es de exactamente UN registro.
ALTER TABLE "traceability"."process_step_closing_reading"
  ADD CONSTRAINT "process_step_closing_reading_un_registro"
  CHECK (num_nonnulls("fermentation_run_id", "drying_run_id", "lot_process_intervention_id") = 1);

-- §4.1: un registro unido a un paso dice qué tipo de paso cumple. Que el tipo sea EL del paso lo
-- decide el servicio (§4.2, el guardián): la base sólo exige que no falte.
ALTER TABLE "traceability"."fermentation_run"
  ADD CONSTRAINT "fermentation_run_paso_exige_tipo"
  CHECK ("recipe_step_id" IS NULL OR "step_type_value_id" IS NOT NULL);
ALTER TABLE "traceability"."drying_run"
  ADD CONSTRAINT "drying_run_paso_exige_tipo"
  CHECK ("recipe_step_id" IS NULL OR "step_type_value_id" IS NOT NULL);
ALTER TABLE "traceability"."lot_process_intervention"
  ADD CONSTRAINT "lot_process_intervention_paso_exige_tipo"
  CHECK ("recipe_step_id" IS NULL OR "step_type_value_id" IS NOT NULL);
ALTER TABLE "traceability"."fermentation_intervention"
  ADD CONSTRAINT "fermentation_intervention_paso_exige_tipo"
  CHECK ("recipe_step_id" IS NULL OR "step_type_value_id" IS NOT NULL);

-- §4.1, decisión de Daniel (2026-10-03): el acto es el tipo de paso y el valor de catálogo dice el
-- «cómo». Una intervención sin ninguno de los dos no dice qué se hizo.
ALTER TABLE "traceability"."lot_process_intervention"
  ADD CONSTRAINT "lot_process_intervention_catalogo_o_tipo"
  CHECK ("catalog_value_id" IS NOT NULL OR "step_type_value_id" IS NOT NULL);

-- §5.2: el control de parecido. Si una Libre se parece a una receta publicada, se guarda con cuál y
-- por qué se creó igual; y parecido y motivo sólo existen en una Libre.
ALTER TABLE "traceability"."process_recipe"
  ADD CONSTRAINT "process_recipe_parecida_exige_motivo"
  CHECK ("parecida_a_version_id" IS NULL OR "motivo_de_libre" IS NOT NULL);
ALTER TABLE "traceability"."process_recipe"
  ADD CONSTRAINT "process_recipe_solo_libre_lleva_parecido_y_motivo"
  CHECK ("es_libre" OR ("parecida_a_version_id" IS NULL AND "motivo_de_libre" IS NULL));
