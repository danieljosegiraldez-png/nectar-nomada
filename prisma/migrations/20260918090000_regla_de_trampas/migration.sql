-- F2 §5 — la regla de trampas que fija el encargado, una por finca. Sin fila no
-- hay avisos ni plazos: no se siembra ningún valor por defecto.
CREATE TABLE "traceability"."trap_rule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "farm_location_id" UUID NOT NULL,
    "trigger_level" "traceability"."TrapCaptureLevel" NOT NULL,
    "normal_days" INTEGER NOT NULL,
    "alert_days" INTEGER NOT NULL,
    "suggested_action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "trap_rule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trap_rule_farm_location_id_key" ON "traceability"."trap_rule"("farm_location_id");

ALTER TABLE "traceability"."trap_rule"
  ADD CONSTRAINT "trap_rule_farm_location_id_fkey" FOREIGN KEY ("farm_location_id")
  REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "trap_rule_created_by_fkey" FOREIGN KEY ("created_by")
  REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
