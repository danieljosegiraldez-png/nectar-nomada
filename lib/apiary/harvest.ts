/**
 * Ticket A3 (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md §2-3).
 * Produces a Lot exactly the way lib/traceability/harvest.ts's
 * recordHarvestEvent does — Lot + event row + a matching
 * QuantityEvent("received") when weight is given, all in one
 * transaction — proving §2's central claim: a honey Lot reuses the
 * existing Sample/Measurement/QuantityEvent/Asset machinery with zero new
 * code, the same way coffee's cherry Lot always has.
 *
 * RBAC checks `apiary:manage` (not `lot:manage`) — harvesting/extracting
 * honey from a colony is an apiary-domain action, resolved via the
 * Colony's own Hive, same as recordInspection/recordColonyEvent. Once the
 * resulting Lot exists, every downstream Traceability function
 * (createSampleFromLot, recordMeasurement, moveLotToStorage,
 * requestLotAssetUpload, computeCurrentQuantity, ...) checks
 * lot:manage/lot:view as normal, unmodified — composing correctly for any
 * Farm Operator who already holds both permissions (A1 granted
 * apiary:manage/apiary:view to the same profile that already had
 * lot:manage/lot:view).
 */
import { prisma } from "../db";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { recordAuditEvent } from "../audit";
import type { ProvenanceClass } from "../../generated/prisma/client";

export interface RecordApiaryHarvestInput {
  lotCode: string;
  colonyId: string;
  occurredAt: Date;
  extractedWeightKg?: number | null;
  framesHarvested?: number | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  // ADR-038 pattern — no default, the caller must state a real class.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function recordApiaryHarvest(userAccountId: string, input: RecordApiaryHarvestInput) {
  const colony = await prisma.colony.findUnique({
    where: { id: input.colonyId },
    include: { hive: { include: { location: true } } },
  });
  if (!colony) throw new ApiaryAccessError("colony_not_found");

  const { hive } = colony;
  await requireApiaryAccess(userAccountId, "manage", [{ projectId: hive.projectId, locationId: hive.locationId }]);

  const provenanceClass = input.provenanceClass;

  const result = await prisma.$transaction(async (tx) => {
    // The resulting Lot carries the same project/organization/location
    // triple every other traceable canonical entity does (T1's own note)
    // — derived from the Colony's own Hive/Location, not re-asked of the
    // caller, since that chain already exists by the time a colony is
    // harvestable.
    const lot = await tx.lot.create({
      data: {
        lotCode: input.lotCode,
        lotType: "honey",
        organizationId: hive.location.organizationId,
        projectId: hive.projectId,
        locationId: hive.locationId,
        createdBy: userAccountId,
      },
    });

    const harvestEvent = await tx.apiaryHarvestEvent.create({
      data: {
        colonyId: input.colonyId,
        occurredAt: input.occurredAt,
        extractedWeightKg: input.extractedWeightKg ?? null,
        framesHarvested: input.framesHarvested ?? null,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        resultingLotId: lot.id,
        createdBy: userAccountId,
        provenanceClass,
        sourceReference: input.sourceReference ?? null,
      },
    });

    // Mirrors recordHarvestEvent exactly: skipped when weight isn't
    // recorded, matching CLAUDE.md §3's "missing must remain missing"
    // discipline rather than fabricating a zero-quantity event.
    if (input.extractedWeightKg != null) {
      await tx.quantityEvent.create({
        data: {
          lotId: lot.id,
          eventType: "received",
          quantity: input.extractedWeightKg,
          unit: "kg",
          occurredAt: input.occurredAt,
          createdBy: userAccountId,
          provenanceClass,
          sourceReference: input.sourceReference ?? null,
        },
      });
    }

    return { harvestEvent, lot };
  });

  // C1 §3: evidentiary write (carries provenanceClass); after the
  // transaction commits, same reasoning as the coffee-side harvest.ts.
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "apiary_harvest_event.create",
    entityType: "apiary_harvest_event",
    entityId: result.harvestEvent.id,
    after: result.harvestEvent,
    sourceInterface: "apiary.service",
  });

  return result;
}
