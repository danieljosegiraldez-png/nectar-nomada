/**
 * Phase 1, ticket T4 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §13, §34). First-mile capture — a Lot only ever comes into existence
 * through a HarvestEvent, a ReceivingEvent, or a LotTransformation output
 * (§30), never created standalone. Both functions here create their Lot
 * (lotType "cherry") and their event row atomically.
 *
 * When cherryWeightKg is given, a matching QuantityEvent ("received") is
 * created in the same transaction so §9's invariant — a lot's current
 * quantity is always SUM(QuantityEvent) — holds from the lot's very first
 * moment, not just from its first transformation onward. Skipped when
 * weight isn't recorded, matching CLAUDE.md §3's "missing must remain
 * missing" discipline rather than fabricating a zero-quantity event.
 */
import { prisma } from "../db";
import { requireLotAccess } from "./lots";
import { recordAuditEvent } from "../audit";
import type { ProvenanceClass } from "../../generated/prisma/client";

export interface RecordHarvestEventInput {
  lotCode: string;
  locationId: string; // the plot
  organizationId: string; // the farm
  projectId?: string | null;
  harvestedAt: Date;
  cultivarNotes?: string | null;
  cherryWeightKg?: number | null;
  brix?: number | null;
  temperatureC?: number | null;
  condition?: string | null;
  ripenessNotes?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required, no fallback. app/actions/traceability.ts passes
  // "measured_fact" here — a harvest weight/brix/temperature reading is an
  // instrument value read off a scale/refractometer/thermometer at
  // receiving, per T9.5 §3(b)'s own worked example.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function recordHarvestEvent(userAccountId: string, input: RecordHarvestEventInput) {
  await requireLotAccess(userAccountId, "manage", [{ projectId: input.projectId, locationId: input.locationId }]);

  const provenanceClass = input.provenanceClass;

  const result = await prisma.$transaction(async (tx) => {
    const lot = await tx.lot.create({
      data: {
        lotCode: input.lotCode,
        lotType: "cherry",
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        locationId: input.locationId,
        createdBy: userAccountId,
      },
    });

    const harvestEvent = await tx.harvestEvent.create({
      data: {
        locationId: input.locationId,
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        harvestedAt: input.harvestedAt,
        cultivarNotes: input.cultivarNotes ?? null,
        cherryWeightKg: input.cherryWeightKg ?? null,
        brix: input.brix ?? null,
        temperatureC: input.temperatureC ?? null,
        condition: input.condition ?? null,
        ripenessNotes: input.ripenessNotes ?? null,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        resultingLotId: lot.id,
        createdBy: userAccountId,
        provenanceClass,
        sourceReference: input.sourceReference ?? null,
      },
    });

    if (input.cherryWeightKg != null) {
      await tx.quantityEvent.create({
        data: {
          lotId: lot.id,
          eventType: "received",
          quantity: input.cherryWeightKg,
          unit: "kg",
          occurredAt: input.harvestedAt,
          createdBy: userAccountId,
          provenanceClass,
          sourceReference: input.sourceReference ?? null,
        },
      });
    }

    return { harvestEvent, lot };
  });

  // C1 §3: evidentiary write (carries provenanceClass); after the
  // transaction commits, same reasoning as recordTransformation.
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "harvest_event.create",
    entityType: "harvest_event",
    entityId: result.harvestEvent.id,
    after: result.harvestEvent,
    sourceInterface: "traceability.service",
  });

  return result;
}

export interface RecordReceivingEventInput {
  lotCode: string;
  organizationId: string; // the supplier
  locationId?: string | null; // where received, if known
  projectId?: string | null;
  receivedAt: Date;
  deliveryNote?: string | null;
  cultivarNotes?: string | null;
  cherryWeightKg?: number | null;
  brix?: number | null;
  temperatureC?: number | null;
  condition?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required — same reasoning as RecordHarvestEventInput above.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function recordReceivingEvent(userAccountId: string, input: RecordReceivingEventInput) {
  await requireLotAccess(userAccountId, "manage", [{ projectId: input.projectId, locationId: input.locationId }]);

  const provenanceClass = input.provenanceClass;

  const result = await prisma.$transaction(async (tx) => {
    const lot = await tx.lot.create({
      data: {
        lotCode: input.lotCode,
        lotType: "cherry",
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        locationId: input.locationId ?? null,
        createdBy: userAccountId,
      },
    });

    const receivingEvent = await tx.receivingEvent.create({
      data: {
        organizationId: input.organizationId,
        locationId: input.locationId ?? null,
        projectId: input.projectId ?? null,
        receivedAt: input.receivedAt,
        deliveryNote: input.deliveryNote ?? null,
        cultivarNotes: input.cultivarNotes ?? null,
        cherryWeightKg: input.cherryWeightKg ?? null,
        brix: input.brix ?? null,
        temperatureC: input.temperatureC ?? null,
        condition: input.condition ?? null,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        resultingLotId: lot.id,
        createdBy: userAccountId,
        provenanceClass,
        sourceReference: input.sourceReference ?? null,
      },
    });

    if (input.cherryWeightKg != null) {
      await tx.quantityEvent.create({
        data: {
          lotId: lot.id,
          eventType: "received",
          quantity: input.cherryWeightKg,
          unit: "kg",
          occurredAt: input.receivedAt,
          createdBy: userAccountId,
          provenanceClass,
          sourceReference: input.sourceReference ?? null,
        },
      });
    }

    return { receivingEvent, lot };
  });

  // C1 §3: evidentiary write (carries provenanceClass).
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "receiving_event.create",
    entityType: "receiving_event",
    entityId: result.receivingEvent.id,
    after: result.receivingEvent,
    sourceInterface: "traceability.service",
  });

  return result;
}
