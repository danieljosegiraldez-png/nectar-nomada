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
import { Prisma } from "../../generated/prisma/client";
import { computeLotBalance } from "./balance";
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { scopeTargetsFor, TraceabilityAccessError, DEFAULT_NEW_RECORD_CLASSIFICATION } from "./lots";
import { faseDelLote } from "../beneficio/reposo";
import type { ClassificationLevel } from "../rbac/types";
import type { DataQuality, HarvestWindowPrecision, ProvenanceClass, MaterialState, SamplingRole, SamplingZone, SampleKind } from "../../generated/prisma/client";

export class SampleValidationError extends Error {}

async function requireSampleAccess(
  userAccountId: string,
  action: "manage" | "view",
  candidates: ReadonlyArray<{ projectId?: string | null; locationId?: string | null; classification: ClassificationLevel }>,
) {
  for (const candidate of candidates) {
    for (const target of scopeTargetsFor(candidate)) {
      if (await can(userAccountId, action, "sample", target, candidate.classification)) return;
    }
  }
  throw new TraceabilityAccessError("no_sample_access");
}

/**
 * La fase actual del lote —fermentación, secado o reposo— leída de sus
 * corridas reales, nunca de un campo que el lote no tiene: "current stage is
 * always derived by querying this lot's LotTransformation history" (comentario
 * de `prisma/schema.prisma` sobre `Lot.status`). Misma consulta que
 * `app/lots/[id]/page.tsx` ya hace para pintar la ficha del lote, resuelta
 * aquí para UN lote — no para el listado de operaciones activas de toda la
 * cuenta que ya expone `getActiveOperations`.
 */
async function faseActualDeLote(lotId: string) {
  const transformaciones = await prisma.lotTransformation.findMany({
    where: { OR: [{ inputs: { some: { lotId } } }, { outputs: { some: { lotId } } }] },
    select: { fermentationRunId: true, dryingRunId: true },
  });
  const fermentationRunIds = [...new Set(transformaciones.map((t) => t.fermentationRunId).filter((id): id is string => id != null))];
  const dryingRunIds = [...new Set(transformaciones.map((t) => t.dryingRunId).filter((id): id is string => id != null))];

  const [fermentationRuns, dryingRuns] = await Promise.all([
    fermentationRunIds.length
      ? prisma.fermentationRun.findMany({ where: { id: { in: fermentationRunIds } }, select: { startedAt: true, endedAt: true } })
      : Promise.resolve([]),
    dryingRunIds.length
      ? prisma.dryingRun.findMany({ where: { id: { in: dryingRunIds } }, select: { startedAt: true, endedAt: true, endedOutcome: true } })
      : Promise.resolve([]),
  ]);

  const fermentacionAbierta = fermentationRuns.find((r) => r.endedAt === null) ?? null;
  const secadoAbierto = dryingRuns.find((r) => r.endedAt === null) ?? null;
  const secadosTerminados = dryingRuns
    .flatMap((r) => (r.endedAt === null ? [] : [{ endedAt: r.endedAt, endedOutcome: r.endedOutcome }]))
    .sort((x, y) => y.endedAt.getTime() - x.endedAt.getTime());

  return faseDelLote({
    fermentacionAbierta,
    secadoAbierto,
    ultimoSecadoTerminado: secadosTerminados[0] ?? null,
  });
}

export interface CreateSampleFromLotInput {
  sampleCode: string;
  sampleType: string;
  materialState?: MaterialState | null;
  samplingRole?: SamplingRole | null;
  samplingZone?: SamplingZone | null;
  samplingZoneNote?: string | null;
  sampleKind?: SampleKind | null;
  stageAtExtraction?: string | null;
  massAtExtraction?: number | null;
  massUnitAtExtraction?: string | null;
  moisturePctAtExtraction?: number | null;
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

/** Tres decimales, los que la columna `Decimal(10,3)` guarda sin redondear. */
function noExcedeTresDecimales(n: number): boolean {
  return Number.isInteger(Math.round(n * 1000)) && Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-9;
}

export async function createSampleFromLot(userAccountId: string, input: CreateSampleFromLotInput) {
  const sourceLot = await prisma.lot.findUnique({ where: { id: input.sourceLotId } });
  if (!sourceLot) throw new TraceabilityAccessError("lot_not_found");

  await requireSampleAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification }]);
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId }]);

  // Decisión de Daniel, 2026-09-18 (docs/superpowers/specs/2026-09-18-muestra-verde-tras-proceso-design.md
  // §3-4): una muestra de café VERDE sólo es válida si el lote ya llegó a
  // almacenamiento — secado terminado con humedad objetivo, la fase "reposo"
  // que `faseDelLote` ya calcula. Bloquea, sin permiso de anulación: una
  // muestra tomada antes es de humedad o de proceso, no verde.
  if (input.materialState === "GREEN") {
    const fase = await faseActualDeLote(input.sourceLotId);
    if (fase?.tipo !== "reposo") {
      throw new SampleValidationError("green_sample_before_reposo");
    }
  }

  const provenanceClass = input.provenanceClass;

  return prisma.$transaction(async (tx) => {
    // El saldo, con el mismo criterio que `applyInputDecrements` usa para toda transformación
    // parcial (`input_exceeds_available`). Aquí faltaba, y la revisión adversarial del 2026-09-25 lo
    // midió: se podía sacar más de lo que hay y, peor, una cantidad NEGATIVA —restada de un saldo—
    // **fabricaba** café, porque `sample_removed` es un evento sustractivo.
    //
    // Dentro de la transacción y no antes: es el mismo `tx` que escribe el evento, así que entre
    // leer el saldo y restarlo no cabe otra extracción.
    let conLibro = false;
    if (input.quantity != null && input.unit) {
      // La columna es `Decimal(10,3)`: 0,0004 kg se guardaría como cero, o sea una medición borrada
      // en silencio. Se rechaza en vez de redondear (revisión de Codex, hallazgo 4).
      if (!(Number.isFinite(input.quantity) && input.quantity > 0) || !noExcedeTresDecimales(input.quantity)) {
        throw new SampleValidationError("sample_quantity_must_be_positive");
      }
      // Bloqueo de fila antes de leer el saldo, el mismo protocolo que `bloquearCosechaEn`: estar
      // dentro de una transacción NO basta, porque el aislamiento por defecto de Postgres es
      // `Read Committed` y dos extracciones simultáneas leerían el mismo saldo (Codex, hallazgo 2).
      await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${input.sourceLotId}::uuid FOR UPDATE`;
      const saldo = await computeLotBalance(tx, input.sourceLotId);
      conLibro = saldo.recorded;
      if (saldo.recorded) {
        if (saldo.unit !== input.unit) throw new SampleValidationError("sample_mixed_units");
        if (new Prisma.Decimal(input.quantity).greaterThan(saldo.quantity)) {
          throw new SampleValidationError("sample_exceeds_available");
        }
      }
    }

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
        materialState: input.materialState,
        samplingRole: input.samplingRole,
        samplingZone: input.samplingZone,
        samplingZoneNote: input.samplingZoneNote,
        sampleKind: input.sampleKind,
        stageAtExtraction: input.stageAtExtraction,
        massAtExtraction: input.massAtExtraction,
        massUnitAtExtraction: input.massUnitAtExtraction,
        moisturePctAtExtraction: input.moisturePctAtExtraction,
        description: input.description ?? null,
        projectId: sourceLot.projectId,
        organizationId: sourceLot.organizationId,
        locationId: sourceLot.locationId,
        sourceLotId: input.sourceLotId,
        sourceTransformationId: transformation.id,
        createdBy: userAccountId,
      },
    });

    // Sin libro no se escribe asiento, exactamente como `applyInputDecrements`: inventar el primer
    // movimiento en negativo convertiría «nunca se pesó» en «pesado y en −2 kg», y dejaría fuera la
    // siguiente muestra legítima (Codex, hallazgo 1). La cantidad declarada se conserva en el
    // `LotTransformationInput` de arriba, que es donde dice lo que se sacó.
    if (input.quantity != null && input.unit && conLibro) {
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

/**
 * Retirar una muestra. Con rastro, nunca editada en su sitio ni borrada —
 * mismo principio que `retirarPatron` en `lib/equipos/equipos.ts`: una vez
 * que algo se usó (aquí, pudo entrar en una cata o en un reporte), editarlo
 * en su sitio borra la historia. `motivo` va al `AuditEvent`, no a una
 * columna nueva de la muestra.
 */
export async function retirarMuestra(userAccountId: string, sampleId: string, cuando: Date, motivo: string) {
  const muestra = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!muestra) throw new TraceabilityAccessError("sample_not_found");

  await requireSampleAccess(userAccountId, "manage", [
    { projectId: muestra.projectId, locationId: muestra.locationId, classification: muestra.classification },
  ]);

  if (muestra.retiredAt) throw new SampleValidationError("sample_already_retired");

  return prisma.$transaction(async (tx) => {
    const retirada = await tx.sample.update({
      where: { id: sampleId },
      data: { retiredAt: cuando },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        entityType: "sample",
        entityId: sampleId,
        operation: "sample.retire",
        reason: motivo,
        before: { retiredAt: muestra.retiredAt },
        after: { retiredAt: cuando.toISOString() },
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return retirada;
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

  await requireSampleAccess(userAccountId, "manage", [{ projectId: input.projectId, locationId: input.locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION }]);

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

    // Dentro de la transacción y con `tx` desde el 2026-09-06: la muestra, su
    // origen y el AuditEvent de los dos se confirman juntos o no se confirma
    // ninguno. Ver la cabecera de `lib/audit.ts`.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "sample.create_external",
        entityType: "sample",
        entityId: sample.id,
        after: { sample, origin },
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return { sample, origin };
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

  await requireSampleAccess(userAccountId, "manage", [{ projectId: existing.sample.projectId, locationId: existing.sample.locationId, classification: existing.sample.classification }]);

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

  // Antes esto era `$transaction([...])`, la forma de ARRAY, que no da cliente
  // de transacción: no había `tx` que pasarle al audit, así que el audit
  // quedaba fuera por construcción. Convertido a la forma de callback el
  // 2026-09-06 para que la actualización, el enlace opcional al lote y el
  // AuditEvent se confirmen juntos. Ver la cabecera de `lib/audit.ts`.
  const origin = await prisma.$transaction(async (tx) => {
    const actualizado = await tx.externalCoffeeOrigin.update({
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
    });

    if (input.linkToLotId) {
      await tx.sample.update({
        where: { id: input.sampleId },
        data: { sourceLotId: input.linkToLotId },
      });
    }

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "external_coffee_origin.complete",
        entityType: "external_coffee_origin",
        entityId: actualizado.id,
        before,
        after: actualizado,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return actualizado;
  });

  return origin;
}
