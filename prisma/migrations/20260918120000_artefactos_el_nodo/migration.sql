-- Artefactos de colmena, Tarea 4: el nodo de sensores, un artefacto con identidad.
-- Spec: docs/superpowers/specs/2026-09-17-artefactos-de-colmena-design.md §B.

-- CreateTable
CREATE TABLE "apiary"."hive_node" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" TEXT NOT NULL,
    "hardware" TEXT,
    "firmware" TEXT,
    "configuration_id" TEXT,
    "organization_id" UUID NOT NULL,
    "lifecycle_status" "core"."EquipmentLifecycle" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "hive_node_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hive_node_device_id_key" ON "apiary"."hive_node"("device_id");
CREATE INDEX "hive_node_organization_id_idx" ON "apiary"."hive_node"("organization_id");

-- AddForeignKey
ALTER TABLE "apiary"."hive_node" ADD CONSTRAINT "hive_node_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apiary"."hive_node" ADD CONSTRAINT "hive_node_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "apiary"."hive_fitting" ADD COLUMN "hive_node_id" UUID;
ALTER TABLE "apiary"."hive_fitting" ADD CONSTRAINT "hive_fitting_hive_node_id_fkey" FOREIGN KEY ("hive_node_id") REFERENCES "apiary"."hive_node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un intervalo de nodo apunta a su aparato, y SÓLO un intervalo de nodo apunta a un aparato.
ALTER TABLE "apiary"."hive_fitting" ADD CONSTRAINT "hive_fitting_nodo_con_aparato"
  CHECK (("kind" = 'nodo_de_sensores') = ("hive_node_id" IS NOT NULL));

-- Un solo nodo ABIERTO por colmena, y un nodo abierto en una sola colmena. Los solapes de
-- intervalos ya cerrados los comprueba el servicio: un índice parcial no ve rangos.
CREATE UNIQUE INDEX "hive_fitting_un_nodo_abierto_por_colmena" ON "apiary"."hive_fitting"("hive_id")
  WHERE "kind" = 'nodo_de_sensores' AND "removed_at" IS NULL;
CREATE UNIQUE INDEX "hive_fitting_nodo_abierto_en_una_colmena" ON "apiary"."hive_fitting"("hive_node_id")
  WHERE "removed_at" IS NULL;
