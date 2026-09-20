import type { TrapCaptureLevel } from "../../generated/prisma/client";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLocationAttributeAccess, resolveOrganizationForLocation } from "./locations";

export class TrapRuleValidationError extends Error {}

const NIVELES: readonly TrapCaptureLevel[] = ["ninguno", "pocos", "algunos", "muchos"];

export interface SaveTrapRuleInput {
  farmLocationId: string;
  triggerLevel: TrapCaptureLevel;
  normalDays: number;
  alertDays: number;
  suggestedAction: string;
  /**
   * El producto fitosanitario que sugiere la regla (spec fitosanitario §4.2).
   * Opcional: `null`/`undefined` es «sin producto», nunca un id inventado.
   * Tiene que existir, ser `isPlantProtection` y ser de la organización de la
   * finca (`resolveOrganizationForLocation(farmLocationId)`) — nunca
   * `farmLocation.organizationId` directo, porque una finca real puede
   * heredarlo de un ancestro.
   */
  suggestedMaterialId?: string | null;
}

/**
 * F2 §5 — la regla que fija el encargado para las trampas de SU finca: una por
 * finca, y guardar otra vez la reemplaza. **Sin regla no hay avisos ni plazos**:
 * este servicio no trae ningún valor por defecto.
 */
export async function saveTrapRule(userAccountId: string, input: SaveTrapRuleInput) {
  const suggestedAction = input.suggestedAction.trim();
  // Del formulario llega una cadena: sin esta comprobación un valor fuera de la
  // escala sería un error de Prisma sin código, y la pantalla se caería.
  if (!NIVELES.includes(input.triggerLevel)) throw new TrapRuleValidationError("trigger_level_invalid");
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

  const suggestedMaterialId = input.suggestedMaterialId ?? null;
  if (suggestedMaterialId) {
    const material = await prisma.consumableMaterial.findUnique({
      where: { id: suggestedMaterialId },
      select: { organizationId: true, isPlantProtection: true },
    });
    if (!material) throw new TrapRuleValidationError("suggested_material_not_found");
    if (!material.isPlantProtection) {
      throw new TrapRuleValidationError("suggested_material_not_plant_protection");
    }
    const organizationId = await resolveOrganizationForLocation(input.farmLocationId);
    if (material.organizationId !== organizationId) {
      throw new TrapRuleValidationError("suggested_material_other_organization");
    }
  }

  const campos = {
    triggerLevel: input.triggerLevel,
    normalDays: input.normalDays,
    alertDays: input.alertDays,
    suggestedAction,
    suggestedMaterialId,
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
