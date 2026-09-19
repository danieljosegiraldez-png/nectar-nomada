-- CreateEnum
CREATE TYPE "apiary"."WaxKind" AS ENUM ('lamina_estampada_propia', 'lamina_comprada', 'sin_lamina', 'otro');

-- CreateEnum
CREATE TYPE "apiary"."WaxDestination" AS ENUM ('camara_de_cria', 'alza');

-- CreateEnum
CREATE TYPE "apiary"."FrameRemovalReason" AS ENUM ('cera_vieja', 'danado', 'enfermedad', 'otro');

-- CreateTable
CREATE TABLE "apiary"."new_wax_entry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "entered_at" TIMESTAMP(3) NOT NULL,
    "frame_count" INTEGER NOT NULL,
    "destination" "apiary"."WaxDestination",
    "wax_kind" "apiary"."WaxKind" NOT NULL,
    "hive_id" UUID,
    "notes" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "new_wax_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apiary"."frame_removal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "wax_year" INTEGER NOT NULL,
    "removed_at" TIMESTAMP(3) NOT NULL,
    "frame_count" INTEGER NOT NULL,
    "reason" "apiary"."FrameRemovalReason" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "frame_removal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "new_wax_entry_organization_id_entered_at_idx" ON "apiary"."new_wax_entry"("organization_id", "entered_at");

-- CreateIndex
CREATE INDEX "new_wax_entry_hive_id_idx" ON "apiary"."new_wax_entry"("hive_id");

-- CreateIndex
CREATE INDEX "frame_removal_organization_id_wax_year_idx" ON "apiary"."frame_removal"("organization_id", "wax_year");

-- AddForeignKey
ALTER TABLE "apiary"."new_wax_entry" ADD CONSTRAINT "new_wax_entry_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."new_wax_entry" ADD CONSTRAINT "new_wax_entry_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "apiary"."hive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."new_wax_entry" ADD CONSTRAINT "new_wax_entry_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."frame_removal" ADD CONSTRAINT "frame_removal_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."frame_removal" ADD CONSTRAINT "frame_removal_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Una entrada o una salida de cero marcos no dice nada.
ALTER TABLE "apiary"."new_wax_entry" ADD CONSTRAINT "new_wax_entry_marcos_positivos" CHECK ("frame_count" > 0);
ALTER TABLE "apiary"."frame_removal" ADD CONSTRAINT "frame_removal_marcos_positivos" CHECK ("frame_count" > 0);

-- «Otro» sin nota no dice qué fue.
ALTER TABLE "apiary"."new_wax_entry" ADD CONSTRAINT "new_wax_entry_otro_con_nota"
  CHECK ("wax_kind" <> 'otro' OR btrim(coalesce("notes", '')) <> '');
ALTER TABLE "apiary"."frame_removal" ADD CONSTRAINT "frame_removal_otro_con_nota"
  CHECK ("reason" <> 'otro' OR btrim(coalesce("notes", '')) <> '');

-- Un marco de un año que no ha llegado no se saca. Y un año razonable: no hay cera de antes de 1990.
ALTER TABLE "apiary"."frame_removal" ADD CONSTRAINT "frame_removal_ano_ya_llegado"
  CHECK ("wax_year" >= 1990 AND "wax_year" <= extract(year FROM "removed_at")::int);
