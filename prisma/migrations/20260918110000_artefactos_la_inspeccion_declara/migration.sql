-- Artefactos de colmena, Tarea 2: la inspección declara el cambio de configuración.
-- «En la inspección sólo se registra la diferencia» (Daniel): el intervalo guarda en qué
-- inspección nació y en cuál se cerró. RESTRICT: una inspección es evidencia.

-- AlterTable
ALTER TABLE "apiary"."hive_fitting" ADD COLUMN "installed_inspection_id" UUID,
ADD COLUMN "removed_inspection_id" UUID;

-- AddForeignKey
ALTER TABLE "apiary"."hive_fitting" ADD CONSTRAINT "hive_fitting_installed_inspection_id_fkey" FOREIGN KEY ("installed_inspection_id") REFERENCES "apiary"."inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."hive_fitting" ADD CONSTRAINT "hive_fitting_removed_inspection_id_fkey" FOREIGN KEY ("removed_inspection_id") REFERENCES "apiary"."inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una inspección de retiro sin fecha de retiro sería un cierre a medias.
ALTER TABLE "apiary"."hive_fitting" ADD CONSTRAINT "hive_fitting_inspeccion_de_retiro_con_fecha"
  CHECK ("removed_inspection_id" IS NULL OR "removed_at" IS NOT NULL);
