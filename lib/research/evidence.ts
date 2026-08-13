/**
 * RO1 (docs/implementation/34_RO1_RESEARCH_OS.md §2). Evidence ->
 * EvidenceClaim -> Interpretation -> Conclusion -> ResearchRecommendation.
 * No dedicated screen (§5 names only protocol/treatment/results UI) — real,
 * RBAC-checked, audited functions so the chain is usable from a script or a
 * future screen without redesign.
 *
 * Evidence reuses Sample/Asset/Measurement rather than re-modeling them
 * (§2: "Sample es canónico y ya llega a Sensory... no necesita mecanismo
 * nuevo") — createEvidence only ever points at existing rows, never copies
 * their content.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireResearchAccess, ResearchAccessError } from "./access";
import type { ProvenanceClass } from "../../generated/prisma/client";

export class EvidenceValidationError extends Error {}

export interface CreateEvidenceInput {
  treatmentBatchId?: string | null;
  sampleId?: string | null;
  assetId?: string | null;
  measurementId?: string | null;
  description?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function createEvidence(userAccountId: string, input: CreateEvidenceInput) {
  if (!input.treatmentBatchId && !input.sampleId && !input.assetId && !input.measurementId) {
    throw new EvidenceValidationError("at_least_one_reference_required");
  }

  let projectId: string | null = null;
  if (input.treatmentBatchId) {
    const batch = await prisma.treatmentBatch.findUnique({ where: { id: input.treatmentBatchId } });
    if (!batch) throw new ResearchAccessError("treatment_batch_not_found");
    projectId = batch.projectId;
  }
  await requireResearchAccess(userAccountId, "create_evidence", [{ projectId }]);

  const evidence = await prisma.evidence.create({
    data: {
      treatmentBatchId: input.treatmentBatchId ?? null,
      sampleId: input.sampleId ?? null,
      assetId: input.assetId ?? null,
      measurementId: input.measurementId ?? null,
      description: input.description ?? null,
      provenanceClass: input.provenanceClass,
      sourceReference: input.sourceReference ?? null,
      createdBy: userAccountId,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "evidence.create",
    entityType: "evidence",
    entityId: evidence.id,
    after: evidence,
    sourceInterface: "research.service",
  });

  return evidence;
}

export async function createEvidenceClaim(userAccountId: string, evidenceId: string, claimText: string) {
  const evidence = await prisma.evidence.findUnique({ where: { id: evidenceId }, include: { treatmentBatch: true } });
  if (!evidence) throw new ResearchAccessError("evidence_not_found");
  await requireResearchAccess(userAccountId, "create_evidence", [{ projectId: evidence.treatmentBatch?.projectId ?? null }]);

  const claim = await prisma.evidenceClaim.create({
    data: { evidenceId, claimText, createdBy: userAccountId },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "evidence_claim.create",
    entityType: "evidence_claim",
    entityId: claim.id,
    after: claim,
    sourceInterface: "research.service",
  });

  return claim;
}

export async function createInterpretation(
  userAccountId: string,
  input: { experimentId: string; evidenceClaimId?: string | null; interpretationText: string },
) {
  const experiment = await prisma.experiment.findUnique({ where: { id: input.experimentId } });
  if (!experiment) throw new ResearchAccessError("experiment_not_found");
  await requireResearchAccess(userAccountId, "create_evidence", [{ projectId: experiment.projectId }]);

  const interpretation = await prisma.interpretation.create({
    data: {
      experimentId: input.experimentId,
      evidenceClaimId: input.evidenceClaimId ?? null,
      interpretationText: input.interpretationText,
      createdBy: userAccountId,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "interpretation.create",
    entityType: "interpretation",
    entityId: interpretation.id,
    after: interpretation,
    sourceInterface: "research.service",
  });

  return interpretation;
}

export interface CreateConclusionInput {
  interpretationId: string;
  conclusionText: string;
  // §4b — required, no default (ADR-038 pattern).
  provenanceClass: ProvenanceClass;
  // §4b — "cualquier conclusión comparativa es provenanceClass =
  // 'interpretation', nunca measured_fact." A single un-replicated
  // TreatmentBatch run can never earn measured-fact certainty about a
  // difference between treatments — enforced below, not just documented.
  isComparative?: boolean;
}

export async function createConclusion(userAccountId: string, input: CreateConclusionInput) {
  const interpretation = await prisma.interpretation.findUnique({ where: { id: input.interpretationId }, include: { experiment: true } });
  if (!interpretation) throw new ResearchAccessError("interpretation_not_found");
  await requireResearchAccess(userAccountId, "approve_protocol", [{ projectId: interpretation.experiment.projectId }]);

  if (input.isComparative && input.provenanceClass === "measured_fact") {
    throw new EvidenceValidationError("comparative_conclusion_cannot_be_measured_fact");
  }

  const conclusion = await prisma.conclusion.create({
    data: {
      interpretationId: input.interpretationId,
      conclusionText: input.conclusionText,
      provenanceClass: input.provenanceClass,
      isComparative: input.isComparative ?? false,
      createdBy: userAccountId,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "conclusion.create",
    entityType: "conclusion",
    entityId: conclusion.id,
    after: conclusion,
    sourceInterface: "research.service",
  });

  return conclusion;
}

/**
 * Named ResearchRecommendation, not Recommendation — see the schema
 * comment on the model itself (prisma/schema.prisma) for the collision
 * this resolves against the AI Layer's own `Recommendation` (Slice 7).
 */
export async function createResearchRecommendation(userAccountId: string, conclusionId: string, recommendationText: string) {
  const conclusion = await prisma.conclusion.findUnique({
    where: { id: conclusionId },
    include: { interpretation: { include: { experiment: true } } },
  });
  if (!conclusion) throw new ResearchAccessError("conclusion_not_found");
  await requireResearchAccess(userAccountId, "approve_protocol", [{ projectId: conclusion.interpretation.experiment.projectId }]);

  const recommendation = await prisma.researchRecommendation.create({
    data: { conclusionId, recommendationText, createdBy: userAccountId },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "research_recommendation.create",
    entityType: "research_recommendation",
    entityId: recommendation.id,
    after: recommendation,
    sourceInterface: "research.service",
  });

  return recommendation;
}
