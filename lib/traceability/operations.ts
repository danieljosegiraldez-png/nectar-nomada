/**
 * T12.6 (docs/implementation/20_CAPTURE_OR_LOSE_IT_REPORT.md). Labour-time
 * and batch-identified material-consumption capture — physical/temporal
 * facts that cannot be reconstructed once the 2026 harvest window closes
 * (ADR-044's capture-or-lose-it clause), unlike money, which can be
 * applied retroactively (a rate can be decided in 2027 and multiplied
 * against hours recorded now; the hours themselves cannot be recovered
 * later if nobody records them today).
 *
 * Same shape as T12.5's media.ts: a discriminated parent union per
 * table, `lotId` carried on every call purely for RBAC scoping (matching
 * every other Lot Detail form's own convention — HarvestEvent/
 * ReceivingEvent/FermentationRun/DryingRun all resolve back to a lot's
 * project/location the same way), and `lot:manage` reused rather than a
 * new permission.
 */
import { prisma } from "../db";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { recordAuditEvent } from "../audit";
import type { DataQuality, ProvenanceClass } from "../../generated/prisma/client";

export class LabourValidationError extends Error {}
export class MaterialConsumptionValidationError extends Error {}

// --- Labour entry --------------------------------------------------------

/**
 * Every parent already sits on the genealogy DAG (harvest/receiving create
 * a Lot; fermentation/drying runs are referenced by the LotTransformations
 * that move a lot between stages) — deliberately no `lotId` FK on the
 * table itself, avoiding a second, potentially ambiguous attachment point
 * for the same fact.
 */
export type LabourEntryParent =
  | { kind: "harvestEvent"; harvestEventId: string }
  | { kind: "receivingEvent"; receivingEventId: string }
  | { kind: "fermentationRun"; fermentationRunId: string }
  | { kind: "dryingRun"; dryingRunId: string };

export interface RecordLabourEntryInput {
  lotId: string;
  parent: LabourEntryParent;
  workerCount: number;
  hours: number;
  taskNote?: string | null;
  // In-kind flag — labour provided by a third party, not Néctar Nómada's
  // own. Optional, off by default — zero cost for the dominant in-house
  // case (§3 of the source report).
  providedByOrganizationId?: string | null;
  occurredAt?: Date;
  operatorPersonId?: string | null;
  // Required, no default — same reasoning as every provenanceClass field
  // since ADR-038. Fixed to direct_observation at the action layer for
  // this ticket's forms (app/actions/traceability.ts) — none of the four
  // attachment points has a genuinely ambiguous provenance.
  provenanceClass: ProvenanceClass;
  // The separate "how much do we trust it" axis — an operator's recalled
  // estimate of hours worked is not a measured_fact (source report §1),
  // but that distinction lives here (verified vs. provisional), not in
  // provenanceClass, which both a same-day tally and a next-morning
  // recollection can equally be direct_observation about.
  dataQuality?: DataQuality | null;
}

function labourParentData(parent: LabourEntryParent) {
  switch (parent.kind) {
    case "harvestEvent":
      return { harvestEventId: parent.harvestEventId };
    case "receivingEvent":
      return { receivingEventId: parent.receivingEventId };
    case "fermentationRun":
      return { fermentationRunId: parent.fermentationRunId };
    case "dryingRun":
      return { dryingRunId: parent.dryingRunId };
  }
}

/**
 * `workerCount`/`hours` are required together (enforced by the NOT NULL
 * columns plus the positivity check here) — a lone number without the
 * other is meaningless (source report §3), but the whole form remains
 * optional to open at all; nothing here blocks
 * startFermentationAction/endFermentationFormAction or any other write
 * path.
 */
export async function recordLabourEntry(userAccountId: string, input: RecordLabourEntryInput) {
  if (!Number.isFinite(input.workerCount) || input.workerCount <= 0) {
    throw new LabourValidationError("worker_count_must_be_positive");
  }
  if (!Number.isFinite(input.hours) || input.hours <= 0) {
    throw new LabourValidationError("hours_must_be_positive");
  }

  const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId }]);

  const labourEntry = await prisma.labourEntry.create({
    data: {
      workerCount: input.workerCount,
      hours: input.hours,
      taskNote: input.taskNote ?? null,
      providedByOrganizationId: input.providedByOrganizationId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      operatorPersonId: input.operatorPersonId ?? null,
      provenanceClass: input.provenanceClass,
      dataQuality: input.dataQuality ?? null,
      createdBy: userAccountId,
      ...labourParentData(input.parent),
    },
  });

  // C1 §3: evidentiary write (carries provenanceClass).
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "labour_entry.create",
    entityType: "labour_entry",
    entityId: labourEntry.id,
    after: labourEntry,
    sourceInterface: "traceability.service",
  });

  return labourEntry;
}

// --- Material consumption entry ------------------------------------------

/** Scoped to fermentation/drying only — the two stages the source report names (yeast/cultures/nutrients/treatments). */
export type MaterialConsumptionParent =
  | { kind: "fermentationRun"; fermentationRunId: string }
  | { kind: "dryingRun"; dryingRunId: string };

export interface RecordMaterialConsumptionEntryInput {
  lotId: string;
  parent: MaterialConsumptionParent;
  materialName: string;
  // The one irrecoverable identity fact (source report §3) — required,
  // same as materialName, even though quantity/unit stay optional below.
  batchLabel: string;
  quantity?: number | null;
  unit?: string | null;
  occurredAt?: Date;
  operatorPersonId?: string | null;
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
  notes?: string | null;
}

function consumptionParentData(parent: MaterialConsumptionParent) {
  switch (parent.kind) {
    case "fermentationRun":
      return { fermentationRunId: parent.fermentationRunId };
    case "dryingRun":
      return { dryingRunId: parent.dryingRunId };
  }
}

/**
 * `quantity`/`unit` stay optional even once the form is opened — "I
 * pitched about 2 kg, no scale at the tank" is worth recording with a
 * note rather than a fabricated precise number (DATA_ARCHITECTURE.md §4's
 * "never a guessed number"). `materialName`/`batchLabel` are required.
 */
export async function recordMaterialConsumptionEntry(userAccountId: string, input: RecordMaterialConsumptionEntryInput) {
  if (!input.materialName.trim()) throw new MaterialConsumptionValidationError("material_name_required");
  if (!input.batchLabel.trim()) throw new MaterialConsumptionValidationError("batch_label_required");

  const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId }]);

  const materialConsumptionEntry = await prisma.materialConsumptionEntry.create({
    data: {
      materialName: input.materialName.trim(),
      batchLabel: input.batchLabel.trim(),
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      operatorPersonId: input.operatorPersonId ?? null,
      provenanceClass: input.provenanceClass,
      dataQuality: input.dataQuality ?? null,
      notes: input.notes ?? null,
      createdBy: userAccountId,
      ...consumptionParentData(input.parent),
    },
  });

  // C1 §3: evidentiary write (carries provenanceClass).
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "material_consumption_entry.create",
    entityType: "material_consumption_entry",
    entityId: materialConsumptionEntry.id,
    after: materialConsumptionEntry,
    sourceInterface: "traceability.service",
  });

  return materialConsumptionEntry;
}
