import type { TrapCaptureLevel } from "../../generated/prisma/client";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLocationAttributeAccess } from "./locations";

export class TrapRuleValidationError extends Error {}

export interface SaveTrapRuleInput {
  farmLocationId: string;
  triggerLevel: TrapCaptureLevel;
  normalDays: number;
  alertDays: number;
  suggestedAction: string;
}

/**
 * F2 §5 — la regla que fija el encargado para las trampas de SU finca: una por
 * finca, y guardar otra vez la reemplaza. **Sin regla no hay avisos ni plazos**:
 * este servicio no trae ningún valor por defecto.
 */
export async function saveTrapRule(userAccountId: string, input: SaveTrapRuleInput) {
  const suggestedAction = input.suggestedAction.trim();
  if (!Number.isInteger(input.normalDays) || !Number.isInteger(input.alertDays)) {
    throw new TrapRuleValidationError("days_must_be_whole_numbers");
  }
  if (input.normalDays <= 0) throw new TrapRuleValidationError("normal_days_must_be_positive");
  if (input.alertDays <= 0) throw new TrapRuleValidationError("alert_days_must_be_positive");
  // Un aviso que tarda más en volver cuando hay broca no es un aviso.
  if (input.alertDays > input.normalDays) {
    throw new TrapRuleValidationError("alert_days_exceed_normal_days");
  }
  if (!suggestedAction) throw new TrapRuleValidationError("suggested_action_required");

  await requireLocationAttributeAccess(userAccountId, input.farmLocationId);

  const campos = {
    triggerLevel: input.triggerLevel,
    normalDays: input.normalDays,
    alertDays: input.alertDays,
    suggestedAction,
  };

  return prisma.$transaction(async (tx) => {
    const before = await tx.trapRule.findUnique({ where: { farmLocationId: input.farmLocationId } });
    const regla = await tx.trapRule.upsert({
      where: { farmLocationId: input.farmLocationId },
      create: { farmLocationId: input.farmLocationId, ...campos, createdBy: userAccountId },
      update: campos,
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "trap_rule.save",
        entityType: "trap_rule",
        entityId: regla.id,
        before: before ?? undefined,
        after: regla,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return regla;
  });
}

export async function getTrapRule(userAccountId: string, farmLocationId: string) {
  await requireLocationAttributeAccess(userAccountId, farmLocationId);
  return prisma.trapRule.findUnique({ where: { farmLocationId } });
}
