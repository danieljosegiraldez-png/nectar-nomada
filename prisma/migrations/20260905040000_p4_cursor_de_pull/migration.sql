-- P4 §5 — lo que hace posible un pull por cursor.
-- Ver `docs/implementation/46_P4_API_Y_SINCRONIZACION.md` §5.
--
-- **Una corrección al ticket, encontrada al construirlo.** §5 decía que el
-- cursor va sobre `updatedAt` y eximía sólo a las tablas append-only (Lot,
-- Measurement, QuantityEvent, LotTransformation), dando por hecho que
-- `field_session` ya tenía la columna. No la tenía — y `field_session` SÍ
-- cambia: `endFieldSession` la cierra. Sin `updated_at`, un dispositivo que
-- descargó una jornada abierta no se enteraría nunca de que cerró, porque no
-- habría por dónde mover el cursor.
--
-- `field_event` NO la lleva y no debe llevarla: comprobado que ningún sitio de
-- código la actualiza ni la borra, así que `created_at` más el id basta.
-- Añadírsela sería mentir sobre su naturaleza para comodidad del cliente, que
-- es exactamente lo que §5 prohíbe.
--
-- Aditivo. Ninguna fila cambia de significado.

-- ---------------------------------------------------------------------------
-- 1. `updated_at` en las jornadas.
--
--    Se rellena desde `created_at` y NO desde `now()`. Medido antes de escribir
--    esto: producción tiene CERO field_session, así que hoy da igual — pero si
--    alguna aparece entre la medición y el despliegue, `now()` le inventaría
--    una fecha de modificación que nunca ocurrió, y un cursor que arranca sobre
--    marcas fabricadas se salta trabajo real la primera vez. Copiar `created_at`
--    dice la verdad disponible: «no se ha tocado desde que se creó».
-- ---------------------------------------------------------------------------
ALTER TABLE "traceability"."field_session" ADD COLUMN "updated_at" TIMESTAMP(3);

UPDATE "traceability"."field_session" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

-- NOT NULL y SIN default en la base, que es la convención de esta casa:
-- `core.organization.updated_at` y `core.person.updated_at` están así. Prisma
-- gestiona `@updatedAt` en la aplicación, y poner además un default de base
-- haría que el esquema y las migraciones discreparan — `migrate diff` lo caza,
-- y lo cazó: mi primera versión sí lo ponía.
ALTER TABLE "traceability"."field_session"
  ALTER COLUMN "updated_at" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Los índices que sostienen el cursor.
--
--    Un cursor sin índice evita repetir filas pero no evita leerlas: la
--    paginación por clave acaba en recorrido secuencial y el ahorro es sólo de
--    red. Son `(marca, id)` y no `(marca)` porque el id es el desempate — dos
--    filas con la misma marca de tiempo tienen que ordenarse de forma estable o
--    la página siguiente se salta una.
-- ---------------------------------------------------------------------------
CREATE INDEX "field_session_updated_at_id_idx"
  ON "traceability"."field_session"("updated_at", "id");

CREATE INDEX "field_event_created_at_id_idx"
  ON "traceability"."field_event"("created_at", "id");
