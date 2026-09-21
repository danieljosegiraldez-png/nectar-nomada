-- Botones de finca y parcela (2026-09-21): el logotipo de una finca.
-- Mismo molde que `evidence_asset_id` en `equipment_condition_report`
-- (20260914180000_equipos_e_instrumentos): apunta a `core.asset`, no se
-- borra al reemplazarlo (ON DELETE SET NULL, no CASCADE), y la fila vieja
-- del Asset se conserva.

-- AlterTable
ALTER TABLE "core"."location" ADD COLUMN "logo_asset_id" UUID;

-- CreateIndex
CREATE INDEX "location_logo_asset_id_idx" ON "core"."location"("logo_asset_id");

-- AddForeignKey
ALTER TABLE "core"."location" ADD CONSTRAINT "location_logo_asset_id_fkey" FOREIGN KEY ("logo_asset_id") REFERENCES "core"."asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
