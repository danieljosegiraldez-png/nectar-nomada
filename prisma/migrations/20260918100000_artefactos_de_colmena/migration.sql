-- Artefactos de colmena, Tarea 1: qué lleva puesta una colmena y desde cuándo.
-- Spec: docs/superpowers/specs/2026-09-17-artefactos-de-colmena-design.md §A.
--
-- Las reglas del intervalo viven también aquí, no sólo en el servicio: un importador
-- o SQL directo se saltan TypeScript.

-- CreateEnum
CREATE TYPE "apiary"."HiveFittingKind" AS ENUM ('excluidor', 'reductor_de_piquera', 'piso_ventilado', 'alimentador', 'alza', 'nodo_de_sensores', 'otro');

-- CreateTable
CREATE TABLE "apiary"."hive_fitting" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_id" UUID NOT NULL,
    "kind" "apiary"."HiveFittingKind" NOT NULL,
    "count" INTEGER,
    "installed_at" TIMESTAMP(3) NOT NULL,
    "removed_at" TIMESTAMP(3),
    "notes" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "hive_fitting_pkey" PRIMARY KEY ("id"),
    -- Retirado ANTES de instalado no es un intervalo. Igual no vale: el intervalo sería vacío.
    CONSTRAINT "hive_fitting_retiro_despues_de_instalacion" CHECK ("removed_at" IS NULL OR "removed_at" > "installed_at"),
    -- La cuenta es de las alzas y sólo de ellas, y una alza sin cuenta no dice cuántas.
    CONSTRAINT "hive_fitting_cuenta_sólo_de_alzas" CHECK (
      ("kind" = 'alza' AND "count" IS NOT NULL AND "count" > 0) OR ("kind" <> 'alza' AND "count" IS NULL)
    ),
    -- «Otro» sin nota no dice qué se puso.
    CONSTRAINT "hive_fitting_otro_con_nota" CHECK ("kind" <> 'otro' OR btrim(coalesce("notes", '')) <> '')
);

-- CreateIndex
CREATE INDEX "hive_fitting_hive_id_installed_at_idx" ON "apiary"."hive_fitting"("hive_id", "installed_at");

-- AddForeignKey
ALTER TABLE "apiary"."hive_fitting" ADD CONSTRAINT "hive_fitting_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "apiary"."hive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."hive_fitting" ADD CONSTRAINT "hive_fitting_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
