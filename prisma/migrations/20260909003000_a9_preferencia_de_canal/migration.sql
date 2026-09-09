-- A9.11 (D10a) — por dónde quiere una persona que le lleguen los avisos.
--
-- Es el CONTRATO, no la integración: ningún proveedor entra con esto. D10 deja
-- los cuatro adaptadores fuera de alcance.
--
-- Cuelga de `core.person`, NO de `core.user_account`. La mayoría de las
-- personas de esta base no tienen correo y por tanto no tienen cuenta: colgarlo
-- de la cuenta excluiría justo a quien trabaja en el campo.
--
-- Medición del 2026-09-08, que es la que justifica que `canalesDe` distinga
-- preferencia de entregabilidad: de 19 personas, **0 tienen teléfono** y 3
-- tienen correo; 16 tienen cuenta. Hoy el único canal que alcanza a alguien es
-- la aplicación, que es además la prioridad declarada de CLAUDE.md §34.
--
-- Tabla nueva y aditiva: no toca ninguna fila existente.

CREATE TYPE "core"."NotificationChannel" AS ENUM ('in_app', 'email', 'whatsapp', 'calendar');

CREATE TABLE "core"."person_notification_preference" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "person_id" UUID NOT NULL,
  "channel" "core"."NotificationChannel" NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_by" UUID,

  CONSTRAINT "person_notification_preference_pkey" PRIMARY KEY ("id")
);

-- Una persona declara una vez por canal: dos filas del mismo canal serían dos
-- respuestas a la misma pregunta.
CREATE UNIQUE INDEX "person_notification_preference_person_id_channel_key"
  ON "core"."person_notification_preference"("person_id", "channel");
CREATE INDEX "person_notification_preference_person_id_idx"
  ON "core"."person_notification_preference"("person_id");

-- `CASCADE` al borrar la persona: una preferencia sin dueño no significa nada.
-- Es lo contrario del criterio de las tablas de hechos, que se protegen con
-- RESTRICT — esto no es un hecho, es una declaración sobre alguien.
ALTER TABLE "core"."person_notification_preference"
  ADD CONSTRAINT "person_notification_preference_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "core"."person"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "core"."person_notification_preference"
  ADD CONSTRAINT "person_notification_preference_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
