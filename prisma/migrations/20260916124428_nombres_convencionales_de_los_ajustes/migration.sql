-- Alinear los nombres de restricciones e índices con los que Prisma deriva del
-- esquema. Sin cambio de comportamiento: las mismas claves, los mismos índices.
--
-- **Por qué hay una segunda migración en vez de editar la primera.** La anterior ya
-- está aplicada, y editar una migración aplicada deja su suma de verificación sin
-- casar — el remedio sería peor que el defecto. Se renombra hacia delante, que es
-- lo que la base sabe hacer sin tocar datos.
--
-- Lo cazó `tests/derivaDeMigraciones.test.ts`, que sólo puede medir con
-- `SHADOW_DATABASE_URL` puesta. Es la segunda vez en dos días que ese guardia
-- encuentra algo real en cuanto se le da con qué medir.

ALTER TABLE "core"."assignment_permission_override"
  RENAME CONSTRAINT "apo_assignment_fkey" TO "assignment_permission_override_assignment_id_fkey";
ALTER TABLE "core"."assignment_permission_override"
  RENAME CONSTRAINT "apo_permission_fkey" TO "assignment_permission_override_permission_id_fkey";
ALTER TABLE "core"."assignment_permission_override"
  RENAME CONSTRAINT "apo_created_by_fkey" TO "assignment_permission_override_created_by_fkey";

ALTER INDEX "core"."apo_assignment_idx"
  RENAME TO "assignment_permission_override_assignment_id_idx";
ALTER INDEX "core"."apo_una_por_asignacion_y_permiso"
  RENAME TO "assignment_permission_override_assignment_id_permission_id_key";
