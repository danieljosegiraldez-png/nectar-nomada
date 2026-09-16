-- «En admin quitar o agregar permisos como correspondan para personalizar»
-- (Daniel, 2026-09-16).
--
-- Quitar y añadir NO son simétricos. Un `deny` sólo ESTRECHA, así que no roza la
-- promesa de `resolve.ts` —las asignaciones contextuales estrechan, nunca
-- ensanchan—. Un `grant` concede algo que ningún perfil concedió, y por eso el
-- CHECK de abajo le exige razón escrita: dentro de un año, «por qué esta persona
-- tiene un permiso que su perfil no le da» es la pregunta que nadie podrá
-- contestar sin ella.

CREATE TYPE "core"."PermissionOverrideEffect" AS ENUM ('deny', 'grant');

CREATE TABLE "core"."assignment_permission_override" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "assignment_id" UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  "effect"        "core"."PermissionOverrideEffect" NOT NULL,
  "reason"        TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"    UUID,
  CONSTRAINT "assignment_permission_override_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "apo_assignment_fkey" FOREIGN KEY ("assignment_id")
    REFERENCES "core"."assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "apo_permission_fkey" FOREIGN KEY ("permission_id")
    REFERENCES "core"."permission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "apo_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Un permiso concedido Y quitado en la misma asignación no es una precedencia
-- que resolver: es una contradicción, y se impide antes de tener que decidirla.
CREATE UNIQUE INDEX "apo_una_por_asignacion_y_permiso"
  ON "core"."assignment_permission_override"("assignment_id", "permission_id");
CREATE INDEX "apo_assignment_idx"
  ON "core"."assignment_permission_override"("assignment_id");

-- La asimetría, impuesta por la base y no sólo por el servicio: un importador o
-- un SQL directo se saltan el servicio, no se saltan esto.
ALTER TABLE "core"."assignment_permission_override"
  ADD CONSTRAINT "apo_grant_exige_razon"
    CHECK ("effect" <> 'grant' OR ("reason" IS NOT NULL AND btrim("reason") <> ''));
