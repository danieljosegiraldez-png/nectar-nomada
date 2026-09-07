-- A9.8 — las tres declaraciones que los alertas críticos del tablero de sitios
-- necesitaban y no existían.
--
-- El ticket A9.8 decía «esquema: no». Se escribió antes de medirlo. Los tres
-- alertas críticos del Anexo C §1.2 —pérdida de colonias sin reposición, visita
-- programada vencida, alimento vencido— no se podían calcular con ninguna
-- columna presente:
--
--   * `Colony` no tiene `endedAt` ni `updatedAt`, así que no hay historial de
--     estado del que derivar «cuántas se perdieron desde la última visita».
--   * `next_visit_due_at` y `coverage_until` son variables del protocolo A9.4,
--     y NO existe tabla de valores de variables de protocolo para captura de
--     campo: `treatment_batch_variable_value` es de investigación.
--
-- Las tres son declaraciones de una persona, no derivados, y por eso son
-- columnas y no una vista. Aditivas y anulables: las visitas ya guardadas no
-- las tienen, y «sin registro» es un dato distinto de cero.
--
-- NOTA sobre lo que este archivo NO trae. `prisma migrate diff` propone además
-- sentencias sobre `traceability.lot_process`, `drying_run` y `fermentation_run`.
-- Esa deriva ya está en `origin/main` ANTES de este cambio —medida con el
-- esquema sin tocar— y viene de los PR #227/#228. No entra aquí: son decisiones
-- de `onDelete` e índices de otra sesión, y arrastrarlas en una migración de
-- apiario las aprobaría sin revisión.

ALTER TABLE "traceability"."field_session"
  ADD COLUMN "next_visit_due_at" TIMESTAMP(3),
  ADD COLUMN "colonies_alive_count" INTEGER;

ALTER TABLE "apiary"."colony_event"
  ADD COLUMN "coverage_until" TIMESTAMP(3);
