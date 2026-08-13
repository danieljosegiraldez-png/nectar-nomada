/**
 * Phase 1, ticket T5 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §18, §34). Extends existing Sample creation with real lot lineage.
 *
 * A sample extracted from a Lot is recorded as a LotTransformation
 * (transformationType "sample_extraction") whose input is the source Lot
 * and whose "output" is the Sample row created here, not a second Lot row
 * (§8.1's DOMAIN_MODEL.md reconciliation table) — T1's recordTransformation
 * already supports zero Lot outputs for exactly this case. When a
 * quantity/unit is given for the material taken, a matching QuantityEvent
 * ("sample_removed") is recorded against the source lot in the same
 * transaction, so T2's SUM(QuantityEvent) invariant accounts for material
 * that left the lot as a sample, not just transformations and losses.
 *
 * RBAC reuses "sample:manage" (RBAC.md §26 — "create samples from lots,
 * extends existing Sample creation, currently unguarded by any
 * lot-specific permission"), scoped against the source lot's own
 * project/location, the same leaf-scope containment check every other
 * traceability write path in this module uses.
 */
import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { scopeTargetsFor, TraceabilityAccessError } from "./lots";
import type { DataQuality, HarvestWindowPrecision, ProvenanceClass } from "../../generated/prisma/client";

export class SampleValidationError extends Error {}

async function requireSampleAccess(
  userAccountId: string,
  action: "manage" | "view",
  candidates: ReadonlyArray<{ projectId?: string | null; locationId?: string | null }>,
) {
  for (const candidate of candidates) {
    for (const target of scopeTargetsFor(candidate)) {
      if (await can(userAccountId, action, "sample", target)) return;
    }
  }
  throw new TraceabilityAccessError("no_sample_access");
}

export interface CreateSampleFromLotInput {
  sampleCode: string;
  sampleType: string;
  description?: string | null;
  sourceLotId: string;
  quantity?: number | null; // amount extracted, if known
  unit?: string | null;
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required, no fallback. app/actions/traceability.ts passes
  // "original_record" — extracting a sample is an action taken against the
  // source lot, per T9.5 §3(b)'s "lot merge or transformation" example.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function createSampleFromLot(userAccountId: string, input: CreateSampleFromLotInput) {
  const sourceLot = await prisma.lot.findUnique({ where: { id: input.sourceLotId } });
  if (!sourceLot) throw new TraceabilityAccessError("lot_not_found");

  await requireSampleAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId }]);

  const provenanceClass = input.provenanceClass;

  return prisma.$transaction(async (tx) => {
    const transformation = await tx.lotTransformation.create({
      data: {
        transformationType: "sample_extraction",
        occurredAt: input.occurredAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
        provenanceClass,
        sourceReference: input.sourceReference ?? null,
        inputs: {
          create: [{ lotId: input.sourceLotId, quantity: input.quantity ?? null, unit: input.unit ?? null }],
        },
      },
    });

    const sample = await tx.sample.create({
      data: {
        sampleCode: input.sampleCode,
        sampleType: input.sampleType,
        description: input.description ?? null,
        projectId: sourceLot.projectId,
        organizationId: sourceLot.organizationId,
        locationId: sourceLot.locationId,
        sourceLotId: input.sourceLotId,
        sourceTransformationId: transformation.id,
        createdBy: userAccountId,
      },
    });

    if (input.quantity != null && input.unit) {
      await tx.quantityEvent.create({
        data: {
          lotId: input.sourceLotId,
          eventType: "sample_removed",
          quantity: input.quantity,
          unit: input.unit,
          occurredAt: input.occurredAt,
          transformationId: transformation.id,
          createdBy: userAccountId,
          provenanceClass,
          sourceReference: input.sourceReference ?? null,
        },
      });
    }

    return { transformation, sample };
  });
}

// --- External coffee (S1, docs/implementation/32_S1_CAFES_EXTERNOS.md) ---

/**
 * §4 — never fabricate a day out of "cosecha 2025." `harvestWindowPrecision`
 * is authoritative: exactly the fields it names may be present, nothing
 * beyond it. Pure validation, no I/O — mirrors F1's getAltitudeRange in
 * spirit (don't invent precision the caller didn't have).
 */
function validateHarvestWindow(input: {
  harvestWindowPrecision?: HarvestWindowPrecision | null;
  harvestYear?: number | null;
  harvestMonth?: number | null;
  harvestDay?: number | null;
}) {
  const { harvestWindowPrecision, harvestYear, harvestMonth, harvestDay } = input;

  if (!harvestWindowPrecision) {
    if (harvestYear != null || harvestMonth != null || harvestDay != null) {
      throw new SampleValidationError("harvest_window_precision_required_when_year_month_or_day_given");
    }
    return;
  }

  if (harvestYear == null) throw new SampleValidationError("harvest_year_required");
  if (harvestWindowPrecision === "year") {
    if (harvestMonth != null || harvestDay != null) throw new SampleValidationError("harvest_month_or_day_not_allowed_at_year_precision");
  } else if (harvestWindowPrecision === "month") {
    if (harvestMonth == null) throw new SampleValidationError("harvest_month_required");
    if (harvestMonth < 1 || harvestMonth > 12) throw new SampleValidationError("harvest_month_out_of_range");
    if (harvestDay != null) throw new SampleValidationError("harvest_day_not_allowed_at_month_precision");
  } else if (harvestWindowPrecision === "date") {
    if (harvestMonth == null) throw new SampleValidationError("harvest_month_required");
    if (harvestMonth < 1 || harvestMonth > 12) throw new SampleValidationError("harvest_month_out_of_range");
    if (harvestDay == null) throw new SampleValidationError("harvest_day_required");
    if (harvestDay < 1 || harvestDay > 31) throw new SampleValidationError("harvest_day_out_of_range");
  }
}

/** A value with no dataQuality is a value nobody has assessed the reliability of — reject rather than silently leave it unrated. */
function requireDataQualityIfValuePresent(value: unknown, dataQuality: DataQuality | null | undefined, fieldName: string) {
  if (value != null && dataQuality == null) {
    throw new SampleValidationError(`${fieldName}_data_quality_required`);
  }
}

export interface RecordExternalCoffeeSampleInput {
  sampleCode: string;
  sampleType: string;
  description?: string | null;
  projectId?: string | null;
  locationId?: string | null;

  // §1 — all three nullable; at least one required (validated below) as
  // the "mínimo que identifique el café."
  producerOrganizationId?: string | null;
  processorOrganizationId?: string | null;
  brandOrganizationId?: string | null;

  // §2 — declared, not observed. Required, no default (ADR-038 pattern):
  // manufacturer_specification or interpretation, chosen at the action layer.
  declaredProvenanceClass: ProvenanceClass;
  sourceReference?: string | null;

  declaredVarietal?: string | null;
  varietalDataQuality?: DataQuality | null;

  declaredProcess?: string | null;
  processDataQuality?: DataQuality | null;

  harvestWindowPrecision?: HarvestWindowPrecision | null;
  harvestYear?: number | null;
  harvestMonth?: number | null;
  harvestDay?: number | null;
  harvestWindowDataQuality?: DataQuality | null;
}

/**
 * §1-§5 golden path: a coffee that never touched this platform's own
 * traceability chain, cupped on the strength of what whoever brought it
 * declared. No Lot, no LotTransformation — `Sample.sourceLotId` stays
 * null, exactly the shape DEMO Sensory/Competitions samples already use
 * (T5's own schema comment on `sourceLotId`). Classification defaults to
 * `internal` (Sample's own column default) and ownership is whoever's
 * `userAccountId` creates it — §5's "nace internal, tuyo" needs no extra
 * code, it's the existing default plus RBAC's existing "access is via
 * Assignment, never via an Organization FK on the record" behavior.
 */
export async function recordExternalCoffeeSample(userAccountId: string, input: RecordExternalCoffeeSampleInput) {
  if (!input.producerOrganizationId && !input.processorOrganizationId && !input.brandOrganizationId) {
    throw new SampleValidationError("at_least_one_organization_required");
  }

  requireDataQualityIfValuePresent(input.declaredVarietal, input.varietalDataQuality, "varietal");
  requireDataQualityIfValuePresent(input.declaredProcess, input.processDataQuality, "process");
  validateHarvestWindow(input);
  if (input.harvestWindowPrecision) {
    requireDataQualityIfValuePresent(input.harvestWindowPrecision, input.harvestWindowDataQuality, "harvest_window");
  }

  await requireSampleAccess(userAccountId, "manage", [{ projectId: input.projectId, locationId: input.locationId }]);

  const now = new Date();

  const { sample, origin } = await prisma.$transaction(async (tx) => {
    const sample = await tx.sample.create({
      data: {
        sampleCode: input.sampleCode,
        sampleType: input.sampleType,
        description: input.description ?? null,
        projectId: input.projectId ?? null,
        locationId: input.locationId ?? null,
        createdBy: userAccountId,
      },
    });

    const origin = await tx.externalCoffeeOrigin.create({
      data: {
        sampleId: sample.id,
        producerOrganizationId: input.producerOrganizationId ?? null,
        processorOrganizationId: input.processorOrganizationId ?? null,
        brandOrganizationId: input.brandOrganizationId ?? null,
        declaredProvenanceClass: input.declaredProvenanceClass,
        sourceReference: input.sourceReference ?? null,
        declaredVarietal: input.declaredVarietal ?? null,
        varietalDataQuality: input.varietalDataQuality ?? null,
        varietalKnownAt: input.declaredVarietal != null ? now : null,
        declaredProcess: input.declaredProcess ?? null,
        processDataQuality: input.processDataQuality ?? null,
        processKnownAt: input.declaredProcess != null ? now : null,
        harvestWindowPrecision: input.harvestWindowPrecision ?? null,
        harvestYear: input.harvestYear ?? null,
        harvestMonth: input.harvestMonth ?? null,
        harvestDay: input.harvestDay ?? null,
        harvestWindowDataQuality: input.harvestWindowDataQuality ?? null,
        harvestWindowKnownAt: input.harvestWindowPrecision != null ? now : null,
        createdBy: userAccountId,
      },
    });

    return { sample, origin };
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "sample.create_external",
    entityType: "sample",
    entityId: sample.id,
    after: { sample, origin },
    sourceInterface: "traceability.service",
  });

  return { sample, origin };
}

export interface CompleteExternalCoffeeOriginInput {
  sampleId: string;

  producerOrganizationId?: string | null;
  processorOrganizationId?: string | null;
  brandOrganizationId?: string | null;

  declaredProvenanceClass?: ProvenanceClass;
  sourceReference?: string | null;

  declaredVarietal?: string | null;
  varietalDataQuality?: DataQuality | null;

  declaredProcess?: string | null;
  processDataQuality?: DataQuality | null;

  harvestWindowPrecision?: HarvestWindowPrecision | null;
  harvestYear?: number | null;
  harvestMonth?: number | null;
  harvestDay?: number | null;
  harvestWindowDataQuality?: DataQuality | null;

  // §6's other named example: once the real Lot is identified, link it —
  // the ExternalCoffeeOrigin row is NOT deleted or cleared when this
  // happens, since "how this record started" (declared, not traced) stays
  // true history even after the gap closes.
  linkToLotId?: string | null;
}

/**
 * §6 — PATCH shape, same convention as F1's updateLocationAttributes:
 * only the keys actually passed are touched. Whichever of varietal/
 * process/harvestWindow is being newly set or changed gets its own
 * `*KnownAt` stamped to now — completing a record later must not look
 * like it was known from the start.
 */
export async function completeExternalCoffeeOrigin(userAccountId: string, input: CompleteExternalCoffeeOriginInput) {
  const existing = await prisma.externalCoffeeOrigin.findUnique({ where: { sampleId: input.sampleId }, include: { sample: true } });
  if (!existing) throw new TraceabilityAccessError("external_coffee_origin_not_found");

  await requireSampleAccess(userAccountId, "manage", [{ projectId: existing.sample.projectId, locationId: existing.sample.locationId }]);

  const nextVarietal = input.declaredVarietal !== undefined ? input.declaredVarietal : existing.declaredVarietal;
  const nextVarietalDataQuality = input.varietalDataQuality !== undefined ? input.varietalDataQuality : existing.varietalDataQuality;
  requireDataQualityIfValuePresent(nextVarietal, nextVarietalDataQuality, "varietal");

  const nextProcess = input.declaredProcess !== undefined ? input.declaredProcess : existing.declaredProcess;
  const nextProcessDataQuality = input.processDataQuality !== undefined ? input.processDataQuality : existing.processDataQuality;
  requireDataQualityIfValuePresent(nextProcess, nextProcessDataQuality, "process");

  const nextHarvestWindow = {
    harvestWindowPrecision: input.harvestWindowPrecision !== undefined ? input.harvestWindowPrecision : existing.harvestWindowPrecision,
    harvestYear: input.harvestYear !== undefined ? input.harvestYear : existing.harvestYear,
    harvestMonth: input.harvestMonth !== undefined ? input.harvestMonth : existing.harvestMonth,
    harvestDay: input.harvestDay !== undefined ? input.harvestDay : existing.harvestDay,
  };
  validateHarvestWindow(nextHarvestWindow);
  const nextHarvestWindowDataQuality =
    input.harvestWindowDataQuality !== undefined ? input.harvestWindowDataQuality : existing.harvestWindowDataQuality;
  if (nextHarvestWindow.harvestWindowPrecision) {
    requireDataQualityIfValuePresent(nextHarvestWindow.harvestWindowPrecision, nextHarvestWindowDataQuality, "harvest_window");
  }

  if (input.linkToLotId) {
    const lot = await prisma.lot.findUnique({ where: { id: input.linkToLotId } });
    if (!lot) throw new TraceabilityAccessError("lot_not_found");
  }

  const now = new Date();
  const varietalChanged = input.declaredVarietal !== undefined && input.declaredVarietal !== existing.declaredVarietal;
  const processChanged = input.declaredProcess !== undefined && input.declaredProcess !== existing.declaredProcess;
  const harvestWindowChanged =
    (input.harvestWindowPrecision !== undefined && input.harvestWindowPrecision !== existing.harvestWindowPrecision) ||
    (input.harvestYear !== undefined && input.harvestYear !== existing.harvestYear) ||
    (input.harvestMonth !== undefined && input.harvestMonth !== existing.harvestMonth) ||
    (input.harvestDay !== undefined && input.harvestDay !== existing.harvestDay);

  const before = existing;

  const [origin] = await prisma.$transaction([
    prisma.externalCoffeeOrigin.update({
      where: { sampleId: input.sampleId },
      data: {
        ...(input.producerOrganizationId !== undefined ? { producerOrganizationId: input.producerOrganizationId } : {}),
        ...(input.processorOrganizationId !== undefined ? { processorOrganizationId: input.processorOrganizationId } : {}),
        ...(input.brandOrganizationId !== undefined ? { brandOrganizationId: input.brandOrganizationId } : {}),
        ...(input.declaredProvenanceClass !== undefined ? { declaredProvenanceClass: input.declaredProvenanceClass } : {}),
        ...(input.sourceReference !== undefined ? { sourceReference: input.sourceReference } : {}),
        ...(input.declaredVarietal !== undefined ? { declaredVarietal: input.declaredVarietal } : {}),
        ...(input.varietalDataQuality !== undefined ? { varietalDataQuality: input.varietalDataQuality } : {}),
        ...(varietalChanged ? { varietalKnownAt: now } : {}),
        ...(input.declaredProcess !== undefined ? { declaredProcess: input.declaredProcess } : {}),
        ...(input.processDataQuality !== undefined ? { processDataQuality: input.processDataQuality } : {}),
        ...(processChanged ? { processKnownAt: now } : {}),
        ...(input.harvestWindowPrecision !== undefined ? { harvestWindowPrecision: input.harvestWindowPrecision } : {}),
        ...(input.harvestYear !== undefined ? { harvestYear: input.harvestYear } : {}),
        ...(input.harvestMonth !== undefined ? { harvestMonth: input.harvestMonth } : {}),
        ...(input.harvestDay !== undefined ? { harvestDay: input.harvestDay } : {}),
        ...(input.harvestWindowDataQuality !== undefined ? { harvestWindowDataQuality: input.harvestWindowDataQuality } : {}),
        ...(harvestWindowChanged ? { harvestWindowKnownAt: now } : {}),
      },
    }),
    ...(input.linkToLotId ? [prisma.sample.update({ where: { id: input.sampleId }, data: { sourceLotId: input.linkToLotId } })] : []),
  ]);

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "external_coffee_origin.complete",
    entityType: "external_coffee_origin",
    entityId: origin.id,
    before,
    after: origin,
    sourceInterface: "traceability.service",
  });

  return origin;
}
