-- Un solo ámbito por tipo cuando NO tiene referente.
--
-- EL HUECO, medido el 2026-09-27. `core.scope` ya tenía
-- `UNIQUE (scope_type, scope_ref_id)` — y no restringía nada para el ámbito de
-- PLATAFORMA, porque en Postgres un índice único trata los NULL como distintos:
-- ('platform', NULL) se podía insertar sin límite. Demostrado dentro de una
-- transacción revertida: un segundo ('platform', NULL) fue ACEPTADO, mientras el
-- control positivo —un ('location', <ref repetido>)— fue RECHAZADO por ese mismo
-- índice. La restricción existía; el caso que importaba se le escapaba.
--
-- LO QUE HABÍA ACUMULADO: 19 ámbitos de plataforma en la base de pruebas
-- compartida, 17 de ellos sin una sola asignación, creados entre el 18 y el 21
-- de septiembre. Se borraron a mano antes de escribir esto; esta migración se
-- encarga de los que haya en CUALQUIER otra base, incluida producción, que no
-- se puede inspeccionar desde aquí.
--
-- POR QUÉ REPUNTAR ES EQUIVALENTE, y no una decisión de producto:
-- `scopeContains` (lib/rbac/resolve.ts) devuelve `true` para un ámbito de
-- plataforma SIN mirar su id — resuelve por tipo, no por identidad. Así que una
-- asignación de plataforma concede lo mismo apunte al ámbito que apunte. Mover
-- las asignaciones al más antiguo no cambia ni un permiso de nadie.
--
-- Prisma no sabe expresar un índice parcial, así que vive aquí en SQL y no en
-- `schema.prisma`, como los de `queen_tenure` y `sensory_wheel_version`.

-- 1. Las asignaciones de los duplicados pasan al ámbito más antiguo de su tipo.
UPDATE "core"."assignment" a
SET "scope_id" = canon."id"
FROM (
  SELECT DISTINCT ON ("scope_type") "id", "scope_type"
  FROM "core"."scope"
  WHERE "scope_ref_id" IS NULL
  ORDER BY "scope_type", "created_at", "id"
) canon
WHERE a."scope_id" IN (
  SELECT s."id" FROM "core"."scope" s
  WHERE s."scope_ref_id" IS NULL AND s."scope_type" = canon."scope_type"
)
AND a."scope_id" <> canon."id";

-- 2. Fuera los duplicados, que ya no los referencia ninguna asignación.
--    `core.assignment.scope_id` es lo ÚNICO que apunta a `core.scope`,
--    comprobado contra information_schema, así que no queda nada colgando.
DELETE FROM "core"."scope" s
WHERE s."scope_ref_id" IS NULL
AND s."id" NOT IN (
  SELECT DISTINCT ON ("scope_type") "id"
  FROM "core"."scope"
  WHERE "scope_ref_id" IS NULL
  ORDER BY "scope_type", "created_at", "id"
);

-- 3. Y que no vuelva a pasar. Sin `scope_ref_id` el único discriminante es el
--    tipo, y con esto sólo puede haber una fila por tipo.
CREATE UNIQUE INDEX "scope_sin_referente_unico"
ON "core"."scope" ("scope_type")
WHERE "scope_ref_id" IS NULL;
