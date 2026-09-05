-- P4, primera rebanada — `Device` y la clave de idempotencia.
-- Ver `docs/implementation/46_P4_API_Y_SINCRONIZACION.md` §1, §3 y §11.
--
-- **Comprobado antes de escribir esto, no asumido** (el ticket §13 lo exige):
-- `traceability.field_event` tiene CERO filas en producción, y ninguna fila de
-- ninguna tabla tiene `device_id` con valor — la columna existe desde P2 §5 y
-- nada la ha escrito nunca. Por eso la FK de abajo no necesita backfill ni
-- puede fallar sobre datos vivos.
--
-- Todo aditivo. Ninguna fila existente cambia.

-- ---------------------------------------------------------------------------
-- 1. §1 — el aparato que sincroniza.
--
--    Una fila por instalación que escribe: hoy un navegador con la PWA, mañana
--    un Android. No es una persona: el operador puede no tener cuenta y el
--    molino puede compartir el teléfono, así que quién hizo el trabajo vive en
--    `operator_person_id` de la fila de datos y esto es DESDE DÓNDE llegó.
--
--    `revoked_at` anulable en vez de un booleano `revoked`: «revocado» y
--    «cuándo» son el mismo hecho y un booleano pierde la mitad.
--
--    SIN `organization_id`, contra lo que pedían el audit §19 y el ticket §1:
--    `ScopeType` no tiene `organization`, así que esa FK no la leería ni la
--    validaría nada. Vuelve cuando exista revocación por organización, que
--    necesita un ámbito que el RBAC todavía no expresa. La razón larga está en
--    el comentario de `model Device` en `schema.prisma`.
-- ---------------------------------------------------------------------------
CREATE TABLE "core"."device" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "operator_person_id" UUID,
  "label"              TEXT NOT NULL,
  "platform"           TEXT NOT NULL,
  "registered_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at"       TIMESTAMP(3),
  "revoked_at"         TIMESTAMP(3),
  "created_by"         UUID,

  CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "core"."device"
  ADD CONSTRAINT "device_operator_person_id_fkey"
  FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "core"."device"
  ADD CONSTRAINT "device_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. §3 — la clave de idempotencia, y la FK que P2 §5 dejó preparada.
--
--    `client_draft_id` es UNIQUE y anulable: sólo la llevan las escrituras que
--    pasaron por una cola offline. Es lo que hace que reintentar un push tras
--    una respuesta perdida sea un no-op en vez de una fila duplicada — el
--    precedente exacto de `apiary.inspection.client_draft_id`.
--
--    Postgres permite tantos NULL como haga falta en una columna UNIQUE, así
--    que las filas creadas desde la web no compiten entre sí.
-- ---------------------------------------------------------------------------
ALTER TABLE "traceability"."field_event" ADD COLUMN "client_draft_id" TEXT;

CREATE UNIQUE INDEX "field_event_client_draft_id_key"
  ON "traceability"."field_event"("client_draft_id");

ALTER TABLE "traceability"."field_event"
  ADD CONSTRAINT "field_event_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "core"."device"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
