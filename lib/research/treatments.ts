/**
 * RO1 (docs/implementation/34_RO1_RESEARCH_OS.md §2, §3, §5). Executing a
 * ProtocolVersion against real material — TreatmentBatch,
 * TreatmentBatchVariableValue, ProcessingStage — plus the one enforcement
 * mechanism §3 exists for: completeProcessingStage refuses to close a stage
 * that's missing one of its ProtocolVersion's declared required
 * measurements (§9.5). "El sistema sabe qué medir" is this function, not a
 * comment.
 */
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import { prisma } from "../db";
import { LIST_LIMIT, truncate } from "../listLimit";
import { recordAuditEvent } from "../audit";
import { requireResearchAccess, ResearchAccessError } from "./access";
import { getSensoryLinkageForSamples } from "../traceability/lots";
import type { ProvenanceClass } from "../../generated/prisma/client";

export class TreatmentBatchValidationError extends Error {}
export class ProcessingStageValidationError extends Error {}

export interface TreatmentBatchVariableValueInput {
  protocolVariableId: string;
  textValue?: string | null;
  numericValue?: number | null;
  booleanValue?: boolean | null;
  // §3a — required when valueType = "catalog".
  catalogValueId?: string | null;
  // §3a — "Spontaneous Wild" case: required when the picked catalogValue's
  // impliesUnknownIdentity is true, validated below rather than silently
  // defaulted.
  dataQuality?: import("../../generated/prisma/client").DataQuality | null;
}

type ProtocolVariableForValidation = {
  id: string;
  name: string;
  valueType: string;
  catalogId: string | null;
  enumValues: string[];
};

/**
 * §3a's validation: a catalog-typed variable's value must be a real
 * VariableCatalogValue belonging to that variable's own catalog (never a
 * free string); a closed_enum-typed variable's value must be one of the
 * ProtocolVariable's own frozen enumValues; the "Spontaneous Wild" case
 * requires dataQuality to be explicitly set, never silently defaulted.
 */
/**
 * Exportada desde el 2026-09-01: `applyAmendment` sólo comprobaba que la
 * variable estuviera declarada en la versión, así que el camino nuevo podía
 * crear `TreatmentBatch` que el canónico habría rechazado — catálogo
 * equivocado, valor fuera de un enum cerrado, identidad desconocida sin
 * `dataQuality`. Lo señaló la revisión independiente: la misma entidad con
 * invariantes distintos según por qué función entres.
 */
export async function validateTreatmentBatchVariableValue(
  variable: ProtocolVariableForValidation,
  value: TreatmentBatchVariableValueInput,
) {
  if (variable.valueType === "catalog") {
    if (!value.catalogValueId) {
      throw new TreatmentBatchValidationError(`catalog_variable_requires_catalog_value_id:${variable.name}`);
    }
    const catalogValue = await prisma.variableCatalogValue.findUnique({ where: { id: value.catalogValueId } });
    if (!catalogValue || catalogValue.catalogId !== variable.catalogId) {
      throw new TreatmentBatchValidationError(`catalog_value_not_in_variable_catalog:${variable.name}`);
    }
    if (catalogValue.impliesUnknownIdentity && !value.dataQuality) {
      throw new TreatmentBatchValidationError(`unknown_identity_value_requires_data_quality:${variable.name}`);
    }
  } else if (variable.valueType === "closed_enum") {
    if (!value.textValue || !variable.enumValues.includes(value.textValue)) {
      throw new TreatmentBatchValidationError(`value_not_in_closed_enum:${variable.name}`);
    }
  }
}

export interface CreateTreatmentBatchInput {
  protocolVersionId: string;
  lotId?: string | null;
  projectId?: string | null;
  batchLabel: string;
  operatorPersonId?: string | null;
  startedAt: Date;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  variableValues: TreatmentBatchVariableValueInput[];
}

export async function createTreatmentBatch(userAccountId: string, input: CreateTreatmentBatchInput) {
  const version = await prisma.protocolVersion.findUnique({
    where: { id: input.protocolVersionId },
    include: { variables: true },
  });
  if (!version) throw new ResearchAccessError("protocol_version_not_found");

  let projectId = input.projectId ?? null;
  let locationId: string | null = null;
  if (input.lotId) {
    const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
    if (!lot) throw new ResearchAccessError("lot_not_found");
    projectId = projectId ?? lot.projectId;
    locationId = lot.locationId;
  }
  await requireResearchAccess(userAccountId, "execute_protocol", [{ projectId, locationId }]);
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ projectId, locationId }]);

  const variablesById = new Map(version.variables.map((v) => [v.id, v]));
  for (const value of input.variableValues) {
    const variable = variablesById.get(value.protocolVariableId);
    if (!variable) {
      throw new TreatmentBatchValidationError("variable_not_declared_on_protocol_version");
    }
    await validateTreatmentBatchVariableValue(variable, value);
  }

  const batch = await prisma.$transaction(async (tx) => {
    const batch = await tx.treatmentBatch.create({
      data: {
        protocolVersionId: input.protocolVersionId,
        lotId: input.lotId ?? null,
        // **Explícito, no por ausencia.** Este camino no crea tratamientos de
        // TERRENO: ésos pasan por `applyAmendment`, que comprueba Gate 0 —la
        // química base, la física base, el biochar caracterizado y el protocolo
        // escrito— antes de escribir nada. Sin esta línea la garantía dependía de
        // que nadie añadiera `locationId` a `CreateTreatmentBatchInput`, que es
        // una ausencia y no una regla. Lo preguntó la revisión independiente del
        // 2026-09-01: «no puedo verificar que todas las rutas capaces de crear un
        // TreatmentBatch experimental pasen por applyAmendment». Ahora sí se
        // puede, y hay un test que lo fija.
        locationId: null,
        projectId,
        batchLabel: input.batchLabel,
        operatorPersonId: input.operatorPersonId ?? null,
        startedAt: input.startedAt,
        notes: input.notes ?? null,
        provenanceClass: input.provenanceClass,
        sourceReference: input.sourceReference ?? null,
        createdBy: userAccountId,
        variableValues: {
          create: input.variableValues.map((v) => ({
            protocolVariableId: v.protocolVariableId,
            textValue: v.textValue ?? null,
            numericValue: v.numericValue ?? null,
            booleanValue: v.booleanValue ?? null,
            catalogValueId: v.catalogValueId ?? null,
            dataQuality: v.dataQuality ?? null,
          })),
        },
      },
      include: { variableValues: { include: { protocolVariable: true } } },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "treatment_batch.create",
        entityType: "treatment_batch",
        entityId: batch.id,
        after: batch,
        sourceInterface: "research.service",
      },
      tx,
    );

    return batch;
  });

  return batch;
}

export async function endTreatmentBatch(userAccountId: string, treatmentBatchId: string, endedAt: Date) {
  const batch = await prisma.treatmentBatch.findUnique({ where: { id: treatmentBatchId } });
  if (!batch) throw new ResearchAccessError("treatment_batch_not_found");
  await requireResearchAccess(userAccountId, "execute_protocol", [{ projectId: batch.projectId }]);

  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.treatmentBatch.update({ where: { id: treatmentBatchId }, data: { endedAt } });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "treatment_batch.end",
        entityType: "treatment_batch",
        entityId: updated.id,
        after: updated,
        sourceInterface: "research.service",
      },
      tx,
    );

    return updated;
  });

  return updated;
}

export interface AddProcessingStageInput {
  treatmentBatchId: string;
  // Free text ("post-fermentación", "seco", "taza") — matched by string
  // equality against ProtocolRequiredMeasurement.atProcessingStage, same
  // vocabulary the protocol version declared its requirements in.
  name: string;
  sequenceOrder: number;
  startedAt: Date;
  // §3a — the room this stage occurred in (typically a drying room).
  // Required for a "nivel de cama" variable value recorded on this batch
  // to be interpretable (§9.6) — nullable here since not every stage is
  // room-scoped (e.g. fermentation in a tank has no drying room).
  locationId?: string | null;
  notes?: string | null;
}

export async function addProcessingStage(userAccountId: string, input: AddProcessingStageInput) {
  const batch = await prisma.treatmentBatch.findUnique({ where: { id: input.treatmentBatchId } });
  if (!batch) throw new ResearchAccessError("treatment_batch_not_found");
  await requireResearchAccess(userAccountId, "execute_protocol", [{ projectId: batch.projectId }]);

  const stage = await prisma.$transaction(async (tx) => {
    const stage = await tx.processingStage.create({
      data: {
        treatmentBatchId: input.treatmentBatchId,
        name: input.name,
        sequenceOrder: input.sequenceOrder,
        startedAt: input.startedAt,
        locationId: input.locationId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "processing_stage.create",
        entityType: "processing_stage",
        entityId: stage.id,
        after: stage,
        sourceInterface: "research.service",
      },
      tx,
    );

    return stage;
  });

  return stage;
}

/**
 * §3/§9.5 — the enforcement half of "un ProtocolVersion declara qué
 * mediciones exige." Refuses to close a stage until every
 * ProtocolRequiredMeasurement whose atProcessingStage matches this stage's
 * name has a corresponding Measurement row linked via processingStageId.
 */
export async function completeProcessingStage(userAccountId: string, processingStageId: string, completedAt: Date) {
  const stage = await prisma.processingStage.findUnique({
    where: { id: processingStageId },
    include: {
      treatmentBatch: { include: { protocolVersion: { include: { requiredMeasurements: true } } } },
      measurements: true,
      observations: true,
    },
  });
  if (!stage) throw new ResearchAccessError("processing_stage_not_found");
  await requireResearchAccess(userAccountId, "execute_protocol", [{ projectId: stage.treatmentBatch.projectId }]);

  const requiredForThisStage = stage.treatmentBatch.protocolVersion.requiredMeasurements.filter(
    (r) => r.atProcessingStage === stage.name,
  );
  const recordedVariables = new Set(stage.measurements.map((m) => m.variable));
  const recordedCatalogIds = new Set(stage.observations.map((o) => o.catalogValueId));
  // A catalog-typed requirement (§3b's Selección/Flotado/etc.) is
  // satisfied by ANY observation on this stage whose picked value belongs
  // to the required catalog — checked via a second query rather than
  // trusting recordedCatalogIds (a VariableCatalogValue id, not the
  // catalog id itself) to line up directly.
  const observedCatalogValues = stage.observations.length
    ? await prisma.variableCatalogValue.findMany({ where: { id: { in: [...recordedCatalogIds] } } })
    : [];
  const observedCatalogIds = new Set(observedCatalogValues.map((v) => v.catalogId));

  const missing = requiredForThisStage.filter((r) => {
    if (r.variable) return !recordedVariables.has(r.variable);
    if (r.catalogId) return !observedCatalogIds.has(r.catalogId);
    return false;
  });
  if (missing.length > 0) {
    throw new ProcessingStageValidationError(
      `missing_required_measurements:${missing.map((m) => m.variable ?? m.catalogId).join(",")}`,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.processingStage.update({ where: { id: processingStageId }, data: { completedAt } });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "processing_stage.complete",
        entityType: "processing_stage",
        entityId: updated.id,
        after: updated,
        sourceInterface: "research.service",
      },
      tx,
    );

    return updated;
  });

  return updated;
}

export interface RecordProcessingStageObservationInput {
  processingStageId: string;
  catalogValueId: string;
  occurredAt: Date;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

/**
 * §3b — a categorical "Estudio de cerezas" pick (Selección, Flotado,
 * Condición visual, Limpieza, Color, Firmeza, Densidad-bracket, Tamaño/
 * forma, Defectos de grano). Distinct from recordMeasurement
 * (lib/traceability/measurements.ts), which stays the path for the
 * numeric readings in the same sheet (Brix, peso inicial, densidad).
 */
export async function recordProcessingStageObservation(userAccountId: string, input: RecordProcessingStageObservationInput) {
  const stage = await prisma.processingStage.findUnique({
    where: { id: input.processingStageId },
    include: { treatmentBatch: true },
  });
  if (!stage) throw new ResearchAccessError("processing_stage_not_found");
  await requireResearchAccess(userAccountId, "execute_protocol", [{ projectId: stage.treatmentBatch.projectId }]);

  const catalogValue = await prisma.variableCatalogValue.findUnique({ where: { id: input.catalogValueId } });
  if (!catalogValue) throw new ResearchAccessError("variable_catalog_value_not_found");

  const observation = await prisma.$transaction(async (tx) => {
    const observation = await tx.processingStageObservation.create({
      data: {
        processingStageId: input.processingStageId,
        catalogValueId: input.catalogValueId,
        occurredAt: input.occurredAt,
        notes: input.notes ?? null,
        provenanceClass: input.provenanceClass,
        sourceReference: input.sourceReference ?? null,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "processing_stage_observation.create",
        entityType: "processing_stage_observation",
        entityId: observation.id,
        after: observation,
        sourceInterface: "research.service",
      },
      tx,
    );

    return observation;
  });

  return observation;
}

export interface RecordWashMediumInput {
  processingStageId: string;
  // Must belong to the "medio_lavado" VariableCatalog (RO1.2 §1a).
  washMediumCatalogValueId: string;
  // Required exactly when the picked catalog value is "mosto_de_otro_lote"
  // — closer to inoculating than to rinsing (PE-106/PE-107), so which lot
  // matters and isn't optional in that one case. Must be absent otherwise:
  // "mosto propio" and "agua limpia"/"ninguno_natural" don't name another
  // lot, and letting one linger on the row would misrepresent provenance.
  washMediumSourceLotId?: string | null;
}

export class WashMediumValidationError extends Error {}

/**
 * RO1.2 §1a — "el medio de lavado tiene su propio estado, y en un
 * experimento eso puede ser tan relevante como el del café." Quantity and
 * the medium's own pH/Brix/temperature stay ordinary Measurement rows
 * (wash_medium_volume/ph/brix/temperature, lib/traceability/units.ts) —
 * this function only sets which medium was used and, when applicable,
 * which other Lot it came from.
 */
export async function recordWashMedium(userAccountId: string, input: RecordWashMediumInput) {
  const stage = await prisma.processingStage.findUnique({
    where: { id: input.processingStageId },
    include: { treatmentBatch: true },
  });
  if (!stage) throw new ResearchAccessError("processing_stage_not_found");
  await requireResearchAccess(userAccountId, "execute_protocol", [{ projectId: stage.treatmentBatch.projectId }]);

  const catalogValue = await prisma.variableCatalogValue.findUnique({
    where: { id: input.washMediumCatalogValueId },
    include: { catalog: true },
  });
  if (!catalogValue) throw new ResearchAccessError("variable_catalog_value_not_found");
  if (catalogValue.catalog.key !== "medio_lavado") {
    throw new WashMediumValidationError("catalog_value_not_in_medio_lavado");
  }

  const isOtherLot = catalogValue.value === "mosto_de_otro_lote";
  if (isOtherLot && !input.washMediumSourceLotId) {
    throw new WashMediumValidationError("mosto_de_otro_lote_requires_source_lot");
  }
  if (!isOtherLot && input.washMediumSourceLotId) {
    throw new WashMediumValidationError("source_lot_only_valid_for_mosto_de_otro_lote");
  }
  if (input.washMediumSourceLotId) {
    const sourceLot = await prisma.lot.findUnique({ where: { id: input.washMediumSourceLotId } });
    if (!sourceLot) throw new ResearchAccessError("wash_medium_source_lot_not_found");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.processingStage.update({
      where: { id: input.processingStageId },
      data: {
        washMediumCatalogValueId: input.washMediumCatalogValueId,
        washMediumSourceLotId: input.washMediumSourceLotId ?? null,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "processing_stage.record_wash_medium",
        entityType: "processing_stage",
        entityId: updated.id,
        after: updated,
        sourceInterface: "research.service",
      },
      tx,
    );

    return updated;
  });

  return updated;
}

export interface RecordProcessSensoryObservationInput {
  processingStageId: string;
  observedAt: Date;
  observerPersonId?: string | null;
  medium: "mosto" | "cereza" | "pergamino" | "grano";
  // §2b-iii — recorded verbatim, in the field worker's own language. Never
  // forced to technical vocabulary; required, since an observation without
  // any descriptor is nothing to record.
  freeTextDescriptor: string;
  // §2b-iii — optional, a later mapping made by someone with judgment, not
  // automatic (same "let the equivalence emerge from use" reasoning RO1.1
  // applied to honey color).
  structuredDescriptorId?: string | null;
  intensity?: string | null;
  // §2b-iii — "la observación que dispara una intervención es distinta de
  // la que solo se anota." Defaults false; never inferred from the text.
  triggeredIntervention?: boolean;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

/**
 * RO1.2 §2b — sensory evaluation of the MEDIUM during processing, distinct
 * from recordProcessingStageObservation (physical cherry state, §3b) and
 * from Assessment (finished product, weeks later). Deliberately does NOT
 * accept an inference/interpretation field — a real inference about
 * microbial activity goes through Evidence -> EvidenceClaim ->
 * Interpretation instead (Evidence.processSensoryObservationId), the same
 * chain RO1's own provenance discipline already established, so
 * observation and inference stay structurally separate, not just
 * textually separate.
 */
export async function recordProcessSensoryObservation(
  userAccountId: string,
  input: RecordProcessSensoryObservationInput,
) {
  const stage = await prisma.processingStage.findUnique({
    where: { id: input.processingStageId },
    include: { treatmentBatch: true },
  });
  if (!stage) throw new ResearchAccessError("processing_stage_not_found");
  await requireResearchAccess(userAccountId, "execute_protocol", [{ projectId: stage.treatmentBatch.projectId }]);
  await exigirPersonaPermitida(userAccountId, input.observerPersonId, [
    { projectId: stage.treatmentBatch.projectId, locationId: stage.treatmentBatch.locationId },
  ]);

  if (!input.freeTextDescriptor.trim()) {
    throw new TreatmentBatchValidationError("free_text_descriptor_required");
  }

  if (input.structuredDescriptorId) {
    const descriptor = await prisma.sensoryDescriptor.findUnique({ where: { id: input.structuredDescriptorId } });
    if (!descriptor) throw new ResearchAccessError("sensory_descriptor_not_found");
  }
  if (input.observerPersonId) {
    const observer = await prisma.person.findUnique({ where: { id: input.observerPersonId } });
    if (!observer) throw new ResearchAccessError("observer_person_not_found");
  }

  const observation = await prisma.$transaction(async (tx) => {
    const observation = await tx.processSensoryObservation.create({
      data: {
        processingStageId: input.processingStageId,
        observedAt: input.observedAt,
        observerPersonId: input.observerPersonId ?? null,
        medium: input.medium,
        freeTextDescriptor: input.freeTextDescriptor,
        structuredDescriptorId: input.structuredDescriptorId ?? null,
        intensity: input.intensity ?? null,
        triggeredIntervention: input.triggeredIntervention ?? false,
        provenanceClass: input.provenanceClass,
        sourceReference: input.sourceReference ?? null,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_sensory_observation.create",
        entityType: "process_sensory_observation",
        entityId: observation.id,
        after: observation,
        sourceInterface: "research.service",
      },
      tx,
    );

    return observation;
  });

  return observation;
}

/**
 * §3 — "Cold hold y fermentación son dos variables independientes ... Eso
 * encaja con el DAG que ya existe: cada etapa es una transformación, y su
 * presencia o ausencia se lee de la cadena en vez de ser un campo
 * booleano." No boolean columns exist for either — this answers "did this
 * batch go through stage X" by querying the DAG directly, matching the
 * ticket's own suggested resolution. Matches by ProcessingStage.name
 * substring (case-insensitive), the same open-vocabulary convention every
 * stage name in this schema already uses.
 */
export async function hasProcessingStage(treatmentBatchId: string, stageNameContains: string): Promise<boolean> {
  const count = await prisma.processingStage.count({
    where: { treatmentBatchId, name: { contains: stageNameContains, mode: "insensitive" } },
  });
  return count > 0;
}

export interface BedLevelContext {
  processingStageId: string;
  level: number;
  locationId: string | null;
  locationName: string | null;
  lightExposure: string | null;
  bedLevelCount: number | null;
}

/**
 * §3a/§9.6 — "confirmar que el nivel de cama se interpreta contra su
 * cuarto." Resolves a bed-level ProtocolVariable's numeric value on a
 * given stage against the Location (room) that stage ran in, so "level 1"
 * in the solar room and "level 1" in the dark room are never treated as
 * the same exposure.
 */
export async function getBedLevelContext(processingStageId: string, protocolVariableId: string): Promise<BedLevelContext | null> {
  const stage = await prisma.processingStage.findUnique({
    where: { id: processingStageId },
    include: { location: true, treatmentBatch: { include: { variableValues: true } } },
  });
  if (!stage) return null;

  const value = stage.treatmentBatch.variableValues.find((v) => v.protocolVariableId === protocolVariableId);
  if (!value || value.numericValue == null) return null;

  return {
    processingStageId,
    level: Number(value.numericValue),
    locationId: stage.location?.id ?? null,
    locationName: stage.location?.name ?? null,
    lightExposure: stage.location?.dryingRoomLightExposure ?? null,
    bedLevelCount: stage.location?.dryingRoomBedLevelCount ?? null,
  };
}

export interface ListTreatmentBatchesFilter {
  protocolVersionId?: string | null;
  lotId?: string | null;
}

export async function listTreatmentBatches(userAccountId: string, filter: ListTreatmentBatchesFilter = {}) {
  await requireResearchAccess(userAccountId, "view", [{}]);
  const rows = await prisma.treatmentBatch.findMany({
    where: {
      ...(filter.protocolVersionId ? { protocolVersionId: filter.protocolVersionId } : {}),
      ...(filter.lotId ? { lotId: filter.lotId } : {}),
    },
    include: {
      variableValues: { include: { protocolVariable: true } },
      processingStages: true,
      protocolVersion: { include: { protocol: true } },
    },
    orderBy: { startedAt: "desc" },
    take: LIST_LIMIT + 1,
  });
  return truncate(rows);
}

/**
 * §5's "ver los resultados de un tratamiento, incluyendo su enlace
 * sensorial" — reuses getSensoryLinkageForSamples (lib/traceability/lots.ts)
 * unmodified against any Sample this batch's Evidence rows reference,
 * exactly the "reusing the existing chain without new code" §9.4 asks for.
 */
export async function getTreatmentBatchDetail(userAccountId: string, treatmentBatchId: string) {
  const batch = await prisma.treatmentBatch.findUnique({
    where: { id: treatmentBatchId },
    include: {
      protocolVersion: { include: { protocol: true, variables: true, requiredMeasurements: true } },
      variableValues: { include: { protocolVariable: true, catalogValue: true } },
      processingStages: {
        include: { measurements: true, observations: { include: { catalogValue: true } }, location: true },
        orderBy: { sequenceOrder: "asc" },
      },
      measurements: { orderBy: { occurredAt: "asc" } },
      evidence: true,
      lot: true,
    },
  });
  if (!batch) throw new ResearchAccessError("treatment_batch_not_found");
  await requireResearchAccess(userAccountId, "view", [{ projectId: batch.projectId }]);

  const sampleIds = batch.evidence.map((e) => e.sampleId).filter((id): id is string => id != null);
  const sensoryLinkage = await getSensoryLinkageForSamples(sampleIds);

  return { ...batch, sensoryLinkage };
}

export interface VariableComparison {
  protocolVariableId: string;
  name: string;
  valueA: string | number | boolean | null;
  valueB: string | number | boolean | null;
  differs: boolean;
}

// §3a-bis/§9.5 — a catalog value's own id is not what comparability keys
// on: an alias and its canonical row must compare as equal. Resolves once
// (aliases don't chain, enforced at write time in
// lib/research/protocols.ts's setVariableCatalogValueAlias).
function catalogComparisonKey(catalogValue: { id: string; aliasOfId: string | null }): string {
  return catalogValue.aliasOfId ?? catalogValue.id;
}

function valueOf(v: {
  textValue: string | null;
  numericValue: unknown;
  booleanValue: boolean | null;
  catalogValue: { id: string; value: string; aliasOfId: string | null } | null;
}) {
  if (v.catalogValue) return catalogComparisonKey(v.catalogValue);
  if (v.textValue != null) return v.textValue;
  if (v.numericValue != null) return Number(v.numericValue);
  if (v.booleanValue != null) return v.booleanValue;
  return null;
}

/**
 * §9.3/§9.5 — "ejecutar dos tratamientos que difieran en una sola variable
 * ... confirmar que se pueden comparar por esa variable," and "dos
 * tratamientos registrados con nombres distintos [pero equivalentes] siguen
 * siendo comparables." A real function, not just a queryable-in-theory
 * schema: diffs two TreatmentBatches' declared variable values one by one,
 * resolving catalog aliases to their canonical value first.
 */
export async function compareTreatmentBatchesByVariable(
  userAccountId: string,
  treatmentBatchIdA: string,
  treatmentBatchIdB: string,
): Promise<VariableComparison[]> {
  const [batchA, batchB] = await Promise.all([
    prisma.treatmentBatch.findUnique({
      where: { id: treatmentBatchIdA },
      include: { variableValues: { include: { protocolVariable: true, catalogValue: true } } },
    }),
    prisma.treatmentBatch.findUnique({
      where: { id: treatmentBatchIdB },
      include: { variableValues: { include: { protocolVariable: true, catalogValue: true } } },
    }),
  ]);
  if (!batchA || !batchB) throw new ResearchAccessError("treatment_batch_not_found");
  await requireResearchAccess(userAccountId, "view", [{ projectId: batchA.projectId }, { projectId: batchB.projectId }]);

  const byVariableA = new Map(batchA.variableValues.map((v) => [v.protocolVariableId, v]));
  const byVariableB = new Map(batchB.variableValues.map((v) => [v.protocolVariableId, v]));
  const allVariableIds = new Set([...byVariableA.keys(), ...byVariableB.keys()]);

  const comparisons: VariableComparison[] = [];
  for (const variableId of allVariableIds) {
    const a = byVariableA.get(variableId);
    const b = byVariableB.get(variableId);
    const name = (a ?? b)!.protocolVariable.name;
    const valueA = a ? valueOf(a) : null;
    const valueB = b ? valueOf(b) : null;
    comparisons.push({ protocolVariableId: variableId, name, valueA, valueB, differs: valueA !== valueB });
  }
  return comparisons;
}
