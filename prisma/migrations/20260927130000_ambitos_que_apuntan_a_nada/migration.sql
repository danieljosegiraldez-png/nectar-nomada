-- Fuera los ámbitos que apuntan a algo que ya no existe.
--
-- QUÉ SON. `core.scope.scope_ref_id` es una referencia POLIMÓRFICA: apunta a un proyecto, a una
-- ubicación o a una sesión según `scope_type`, y por eso NO tiene clave ajena. Sin clave ajena,
-- borrar el proyecto o la ubicación deja el ámbito apuntando al vacío, y nada avisa.
--
-- MEDIDO sobre el backup verificado del 2026-09-21 restaurado en una base privada —producción a esa
-- fecha, 46 ámbitos y 44 asignaciones, cuadrando con su `rowcounts.tsv`—: **28 ámbitos** sin una
-- sola asignación y con el referente ya borrado. 26 de proyecto, 1 de ubicación, 1 de sesión. La
-- base de pruebas compartida tenía exactamente los mismos 28, porque sale de ese mismo backup.
--
-- POR QUÉ ES SEGURO. Sólo borra el ámbito cuando se cumplen LAS DOS cosas: que ninguna asignación
-- lo referencie —y `core.assignment.scope_id` es lo único que apunta a `core.scope`, comprobado
-- contra `information_schema`— y que su referente no exista. Un ámbito con asignación no se toca
-- aunque su referente haya desaparecido: ahí hay un permiso concedido y la decisión de qué hacer
-- con él no es de una migración.
--
-- ACOTADA A PROPÓSITO a los tres tipos que existen en producción. `program`, `competition` y
-- `experience` NO se tocan: no hay ninguno, y no he verificado a qué tabla apuntarían. Si aparece
-- uno colgante, se queda — que es el fallo seguro.
--
-- Para `session` se comprueban LAS CINCO tablas de sesión que existen, no la que parece obvia. El
-- único colgante de producción no está en ninguna de ellas, comprobado una por una.
--
-- ESTO NO SE REPITE SOLO. Es una limpieza de una vez: mientras `scope_ref_id` siga sin clave ajena,
-- borrar una ubicación puede volver a dejar un ámbito colgante. Cerrar eso es otra decisión.

DELETE FROM "core"."scope" s
WHERE s."scope_ref_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "core"."assignment" a WHERE a."scope_id" = s."id")
  AND (
       (s."scope_type" = 'project'
        AND NOT EXISTS (SELECT 1 FROM "core"."project" x WHERE x."id" = s."scope_ref_id"))
    OR (s."scope_type" = 'location'
        AND NOT EXISTS (SELECT 1 FROM "core"."location" x WHERE x."id" = s."scope_ref_id"))
    OR (s."scope_type" = 'session'
        AND NOT EXISTS (SELECT 1 FROM "sensory"."sensory_session"        x WHERE x."id" = s."scope_ref_id")
        AND NOT EXISTS (SELECT 1 FROM "sensory"."calibration_session"    x WHERE x."id" = s."scope_ref_id")
        AND NOT EXISTS (SELECT 1 FROM "traceability"."field_session"     x WHERE x."id" = s."scope_ref_id")
        AND NOT EXISTS (SELECT 1 FROM "traceability"."roast_session"     x WHERE x."id" = s."scope_ref_id")
        AND NOT EXISTS (SELECT 1 FROM "experiences"."experience_session" x WHERE x."id" = s."scope_ref_id"))
  );
