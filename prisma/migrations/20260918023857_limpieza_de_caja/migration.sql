-- La limpieza de la CAJA, no de una colonia (ADR-159).
--
-- POR QUE UNA TABLA NUEVA. Hasta hoy todo evento del apiario colgaba de `colony`.
-- La limpieza no puede: una caja vacia se desinfecta ANTES de recibir otra colonia,
-- y en ese momento no hay colonia de la que colgarla. Decision del dueno el
-- 2026-09-17: «1, sobre la caja».
--
-- LOS NOMBRES DE LOS ACTOS salen de `docs/dominio/varroa-inspeccion-desinfeccion.md`,
-- que es BORRADOR. Se toman los nombres de los procedimientos, NO sus cifras: la
-- concentracion de la sosa, los minutos de inmersion o las 48 h al sol no son el
-- valor por defecto de nada (ADR-158).

-- CreateEnum
CREATE TYPE "apiary"."HiveCleaningAct" AS ENUM ('raspado', 'flameado', 'inmersion_sosa', 'aclarado', 'secado_al_sol', 'renovacion_de_cera', 'otro');
-- CreateEnum
CREATE TYPE "apiary"."HiveCleaningReason" AS ENUM ('baja_de_colonia', 'fusion_de_colonias', 'renovacion_programada', 'sospecha_de_enfermedad', 'otro');
-- CreateTable
CREATE TABLE "apiary"."hive_cleaning" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "acts" "apiary"."HiveCleaningAct"[],
    "act_other_note" TEXT,
    "reason" "apiary"."HiveCleaningReason",
    "reason_other_note" TEXT,
    "notes" TEXT,
    "operator_person_id" UUID,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "data_quality" "core"."DataQuality",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "hive_cleaning_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "hive_cleaning_hive_id_idx" ON "apiary"."hive_cleaning"("hive_id");
-- AddForeignKey
ALTER TABLE "apiary"."hive_cleaning" ADD CONSTRAINT "hive_cleaning_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "apiary"."hive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "apiary"."hive_cleaning" ADD CONSTRAINT "hive_cleaning_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "apiary"."hive_cleaning" ADD CONSTRAINT "hive_cleaning_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- LAS REGLAS VIVEN TAMBIEN EN LA BASE, no solo en el servicio. El CLAUDE.md del
-- repositorio lo dice sin rodeos: una restriccion que vive en TypeScript «no existe
-- para la base» -- un importador, una reparacion o SQL directo se la saltan.

-- Una limpieza sin ningun acto no afirma nada.
ALTER TABLE "apiary"."hive_cleaning" ADD CONSTRAINT "hive_cleaning_al_menos_un_acto"
  CHECK (cardinality("acts") > 0);

-- `otro` sin decir cual es la respuesta vacia de ADR-125 disfrazada de dato. El
-- literal se castea al enum a proposito: comparar un texto con un arreglo de enum sin
-- cast no es portable entre versiones de Postgres.
ALTER TABLE "apiary"."hive_cleaning" ADD CONSTRAINT "hive_cleaning_otro_dice_cual"
  CHECK (NOT ('otro'::"apiary"."HiveCleaningAct" = ANY("acts"))
         OR ("act_other_note" IS NOT NULL AND btrim("act_other_note") <> ''));

ALTER TABLE "apiary"."hive_cleaning" ADD CONSTRAINT "hive_cleaning_razon_otro_dice_cual"
  CHECK ("reason" IS DISTINCT FROM 'otro'::"apiary"."HiveCleaningReason"
         OR ("reason_other_note" IS NOT NULL AND btrim("reason_other_note") <> ''));

-- LO QUE NO PUEDE SER UN CHECK, y se dice para que nadie lo cuente como estructural:
-- «la caja estaba vacia EN LA FECHA de la limpieza» cruza a otra tabla (`colony`), y
-- un CHECK solo ve su propia fila. Esa regla vive en el servicio.
