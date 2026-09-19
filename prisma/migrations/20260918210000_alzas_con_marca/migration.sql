-- AlterTable
ALTER TABLE "apiary"."hive_fitting" ADD COLUMN     "hive_super_id" UUID;

-- CreateTable
CREATE TABLE "apiary"."hive_super" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "in_service_at" TIMESTAMP(3),
    "lifecycle_status" "core"."EquipmentLifecycle" NOT NULL DEFAULT 'active',
    "retired_at" TIMESTAMP(3),
    "retired_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "hive_super_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apiary"."apiary_harvest_super" (
    "apiary_harvest_event_id" UUID NOT NULL,
    "hive_super_id" UUID NOT NULL,

    CONSTRAINT "apiary_harvest_super_pkey" PRIMARY KEY ("apiary_harvest_event_id","hive_super_id")
);

-- CreateIndex
CREATE INDEX "hive_super_organization_id_idx" ON "apiary"."hive_super"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "hive_super_organization_id_code_key" ON "apiary"."hive_super"("organization_id", "code");

-- CreateIndex
CREATE INDEX "apiary_harvest_super_hive_super_id_idx" ON "apiary"."apiary_harvest_super"("hive_super_id");

-- CreateIndex
CREATE INDEX "hive_fitting_hive_super_id_idx" ON "apiary"."hive_fitting"("hive_super_id");

-- AddForeignKey
ALTER TABLE "apiary"."hive_fitting" ADD CONSTRAINT "hive_fitting_hive_super_id_fkey" FOREIGN KEY ("hive_super_id") REFERENCES "apiary"."hive_super"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."hive_super" ADD CONSTRAINT "hive_super_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."hive_super" ADD CONSTRAINT "hive_super_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."apiary_harvest_super" ADD CONSTRAINT "apiary_harvest_super_apiary_harvest_event_id_fkey" FOREIGN KEY ("apiary_harvest_event_id") REFERENCES "apiary"."apiary_harvest_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."apiary_harvest_super" ADD CONSTRAINT "apiary_harvest_super_hive_super_id_fkey" FOREIGN KEY ("hive_super_id") REFERENCES "apiary"."hive_super"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- La marca se guarda normalizada: «a-07 » y «A-07» son la misma alza, y el índice único lo
-- tiene que ver así. El servicio normaliza; esto impide que otra vía guarde la otra forma.
ALTER TABLE "apiary"."hive_super" ADD CONSTRAINT "hive_super_marca_normalizada"
  CHECK ("code" <> '' AND "code" = upper(btrim("code")));

-- Activa ⇔ sin baja. Fuera de servicio ⇒ con fecha y con motivo que diga algo.
ALTER TABLE "apiary"."hive_super" ADD CONSTRAINT "hive_super_baja_completa" CHECK (
  ("lifecycle_status" = 'active' AND "retired_at" IS NULL AND "retired_reason" IS NULL)
  OR ("lifecycle_status" <> 'active' AND "retired_at" IS NOT NULL AND btrim(coalesce("retired_reason", '')) <> '')
);

-- Una fila que apunta a un alza con marca ES un alza, y es UNA.
ALTER TABLE "apiary"."hive_fitting" ADD CONSTRAINT "hive_fitting_alza_marcada_es_una"
  CHECK ("hive_super_id" IS NULL OR ("kind" = 'alza' AND "count" = 1));

-- Un alza marcada está ABIERTA en una sola colmena. Los solapes con intervalos ya cerrados los
-- comprueba el servicio: un índice parcial no ve rangos (igual que el nodo).
CREATE UNIQUE INDEX "hive_fitting_alza_abierta_en_una_colmena" ON "apiary"."hive_fitting"("hive_super_id")
  WHERE "hive_super_id" IS NOT NULL AND "removed_at" IS NULL;
