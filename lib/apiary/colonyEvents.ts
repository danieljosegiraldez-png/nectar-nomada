/**
 * Ticket A2 — REVISED (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md
 * §1a, §3). feeding/treatment/passing_observation share one
 * type-discriminated table — none of the three carries Inspection's
 * evidentiary claim, so mixing them here (but never with Inspection
 * itself) is safe. Same shape as FermentationIntervention/DryingTurnEvent/
 * QuantityEvent elsewhere in this schema.
 *
 * RBAC resolves via the parent Colony's own Hive, same as ./inspections.
 */
import { prisma } from "../db";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import type { ColonyEventType, ProvenanceClass } from "../../generated/prisma/client";

export class ColonyEventValidationError extends Error {}

async function resolveColonyScope(colonyId: string) {
  const colony = await prisma.colony.findUnique({ where: { id: colonyId }, include: { hive: true } });
  if (!colony) throw new ApiaryAccessError("colony_not_found");
  return { projectId: colony.hive.projectId, locationId: colony.hive.locationId };
}

export interface RecordColonyEventInput {
  colonyId: string;
  eventType: ColonyEventType;
  occurredAt?: Date;
  operatorPersonId?: string | null;
  feedingMaterial?: string | null;
  feedingQuantity?: number | null;
  feedingUnit?: string | null;
  treatmentProduct?: string | null;
  // Required whenever eventType = treatment (§1a) — enforced below, not by
  // the DB column, same shape as recordMaterialConsumptionEntry's own
  // batchLabel requiredness (T12.6).
  treatmentBatchLabel?: string | null;
  treatmentDose?: number | null;
  treatmentDoseUnit?: string | null;
  note?: string | null;
}

/**
 * §1a's own framing, mapped onto ProvenanceClass values that already
 * exist: feeding/treatment are a record of an action taken
 * (`original_record`); passing_observation is a state fact, witnessed
 * (`direct_observation`). Not caller-supplied — fixed here, at the action
 * layer, per eventType, same non-operator-selectable discipline every
 * other fixed provenanceClass in this codebase already follows.
 */
function provenanceClassFor(eventType: ColonyEventType): ProvenanceClass {
  switch (eventType) {
    case "feeding":
    case "treatment":
      return "original_record";
    case "passing_observation":
    case "other":
      return "direct_observation";
  }
}

export async function recordColonyEvent(userAccountId: string, input: RecordColonyEventInput) {
  if (input.eventType === "treatment" && !input.treatmentBatchLabel?.trim()) {
    throw new ColonyEventValidationError("treatment_batch_label_required");
  }

  const scope = await resolveColonyScope(input.colonyId);
  await requireApiaryAccess(userAccountId, "manage", [scope]);

  return prisma.colonyEvent.create({
    data: {
      colonyId: input.colonyId,
      eventType: input.eventType,
      occurredAt: input.occurredAt ?? new Date(),
      operatorPersonId: input.operatorPersonId ?? null,
      feedingMaterial: input.feedingMaterial ?? null,
      feedingQuantity: input.feedingQuantity ?? null,
      feedingUnit: input.feedingUnit ?? null,
      treatmentProduct: input.treatmentProduct ?? null,
      treatmentBatchLabel: input.treatmentBatchLabel?.trim() ?? null,
      treatmentDose: input.treatmentDose ?? null,
      treatmentDoseUnit: input.treatmentDoseUnit ?? null,
      note: input.note ?? null,
      provenanceClass: provenanceClassFor(input.eventType),
      createdBy: userAccountId,
    },
  });
}

export async function listColonyEventsForColony(userAccountId: string, colonyId: string) {
  const scope = await resolveColonyScope(colonyId);
  await requireApiaryAccess(userAccountId, "view", [scope]);

  return prisma.colonyEvent.findMany({ where: { colonyId }, orderBy: { occurredAt: "desc" } });
}
