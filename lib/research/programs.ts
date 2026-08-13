/**
 * RO1 (docs/implementation/34_RO1_RESEARCH_OS.md §2). The foundation of the
 * chain — ResearchProgram -> ResearchQuestion -> Hypothesis -> Experiment.
 * No dedicated UI (§5 names only protocol authoring/execution/results); a
 * caller creating a Protocol still needs a real Experiment to hang it off,
 * so these are real, RBAC-checked, audited functions, just not
 * screen-connected yet.
 *
 * Gated on research:approve_protocol, not create_evidence/create_measurement
 * — standing up a program/question/hypothesis/experiment is design
 * authority (the product owner's role, §1), distinct from executing a
 * protocol or recording evidence against one.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireResearchAccess, ResearchAccessError } from "./access";
import type { RecordStatus } from "../../generated/prisma/client";

export class ResearchValidationError extends Error {}

export interface CreateResearchProgramInput {
  name: string;
  description?: string | null;
  status?: RecordStatus;
}

export async function createResearchProgram(userAccountId: string, input: CreateResearchProgramInput) {
  await requireResearchAccess(userAccountId, "approve_protocol", [{}]);

  const program = await prisma.researchProgram.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "draft",
      createdBy: userAccountId,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "research_program.create",
    entityType: "research_program",
    entityId: program.id,
    after: program,
    sourceInterface: "research.service",
  });

  return program;
}

export async function createResearchQuestion(userAccountId: string, researchProgramId: string, questionText: string) {
  const program = await prisma.researchProgram.findUnique({ where: { id: researchProgramId } });
  if (!program) throw new ResearchAccessError("research_program_not_found");
  await requireResearchAccess(userAccountId, "approve_protocol", [{}]);

  const question = await prisma.researchQuestion.create({
    data: { researchProgramId, questionText, createdBy: userAccountId },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "research_question.create",
    entityType: "research_question",
    entityId: question.id,
    after: question,
    sourceInterface: "research.service",
  });

  return question;
}

export async function createHypothesis(userAccountId: string, researchQuestionId: string, statement: string) {
  const question = await prisma.researchQuestion.findUnique({ where: { id: researchQuestionId } });
  if (!question) throw new ResearchAccessError("research_question_not_found");
  await requireResearchAccess(userAccountId, "approve_protocol", [{}]);

  const hypothesis = await prisma.hypothesis.create({
    data: { researchQuestionId, statement, createdBy: userAccountId },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "hypothesis.create",
    entityType: "hypothesis",
    entityId: hypothesis.id,
    after: hypothesis,
    sourceInterface: "research.service",
  });

  return hypothesis;
}

export interface CreateExperimentInput {
  researchProgramId: string;
  hypothesisId?: string | null;
  projectId?: string | null;
  name: string;
  description?: string | null;
  status?: RecordStatus;
}

export async function createExperiment(userAccountId: string, input: CreateExperimentInput) {
  const program = await prisma.researchProgram.findUnique({ where: { id: input.researchProgramId } });
  if (!program) throw new ResearchAccessError("research_program_not_found");
  await requireResearchAccess(userAccountId, "approve_protocol", [{ projectId: input.projectId }]);

  const experiment = await prisma.experiment.create({
    data: {
      researchProgramId: input.researchProgramId,
      hypothesisId: input.hypothesisId ?? null,
      projectId: input.projectId ?? null,
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "draft",
      createdBy: userAccountId,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "experiment.create",
    entityType: "experiment",
    entityId: experiment.id,
    after: experiment,
    sourceInterface: "research.service",
  });

  return experiment;
}

export async function listResearchPrograms(userAccountId: string) {
  await requireResearchAccess(userAccountId, "view", [{}]);
  return prisma.researchProgram.findMany({
    include: { questions: { include: { hypotheses: true } }, experiments: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getExperimentDetail(userAccountId: string, experimentId: string) {
  const experiment = await prisma.experiment.findUnique({
    where: { id: experimentId },
    include: {
      researchProgram: true,
      hypothesis: true,
      protocols: { include: { versions: true } },
      controlTreatmentBatch: true,
      derivedFromExperiment: true,
      derivedExperiments: true,
    },
  });
  if (!experiment) throw new ResearchAccessError("experiment_not_found");
  await requireResearchAccess(userAccountId, "view", [{ projectId: experiment.projectId }]);
  return experiment;
}

/**
 * §4a — "cada experimento tiene un tratamiento control explícito ... el
 * modelo debe registrarlo como tal." Declared, not inferred: the caller
 * names which already-created TreatmentBatch is the baseline. The batch
 * must belong to a ProtocolVersion under this same Experiment (via
 * Protocol.experimentId) — a control from an unrelated experiment would
 * make "distinguido de los demás tratamientos" (§9.10) meaningless.
 */
export async function declareControlTreatmentBatch(userAccountId: string, experimentId: string, treatmentBatchId: string) {
  const experiment = await prisma.experiment.findUnique({ where: { id: experimentId } });
  if (!experiment) throw new ResearchAccessError("experiment_not_found");
  const batch = await prisma.treatmentBatch.findUnique({
    where: { id: treatmentBatchId },
    include: { protocolVersion: { include: { protocol: true } } },
  });
  if (!batch) throw new ResearchAccessError("treatment_batch_not_found");
  if (batch.protocolVersion.protocol.experimentId !== experimentId) {
    throw new ResearchValidationError("control_treatment_batch_must_belong_to_experiment");
  }
  await requireResearchAccess(userAccountId, "approve_protocol", [{ projectId: experiment.projectId }]);

  const updated = await prisma.experiment.update({
    where: { id: experimentId },
    data: { controlTreatmentBatchId: treatmentBatchId },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "experiment.declare_control_treatment_batch",
    entityType: "experiment",
    entityId: experimentId,
    after: { controlTreatmentBatchId: treatmentBatchId },
    sourceInterface: "research.service",
  });

  return updated;
}

/**
 * §4f — "linaje entre ensayos... qué ensayo derivó de cuál y por qué."
 * Scientific/experimental derivation, deliberately separate from the Lot
 * lineage DAG (a physical split) — this is "trial #3's finding shaped
 * trial #4's design," recorded with the reason, not inferred from any
 * physical-material relationship.
 */
export async function declareExperimentLineage(
  userAccountId: string,
  experimentId: string,
  derivedFromExperimentId: string,
  derivationNote: string,
) {
  const experiment = await prisma.experiment.findUnique({ where: { id: experimentId } });
  if (!experiment) throw new ResearchAccessError("experiment_not_found");
  const parent = await prisma.experiment.findUnique({ where: { id: derivedFromExperimentId } });
  if (!parent) throw new ResearchAccessError("derived_from_experiment_not_found");
  if (derivedFromExperimentId === experimentId) {
    throw new ResearchValidationError("experiment_cannot_derive_from_itself");
  }
  await requireResearchAccess(userAccountId, "approve_protocol", [{ projectId: experiment.projectId }]);

  const updated = await prisma.experiment.update({
    where: { id: experimentId },
    data: { derivedFromExperimentId, derivationNote },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "experiment.declare_lineage",
    entityType: "experiment",
    entityId: experimentId,
    after: { derivedFromExperimentId, derivationNote },
    sourceInterface: "research.service",
  });

  return updated;
}

/**
 * §4g — "el modelo debe poder registrarlo junto al experimento, no dejarlo
 * solo en un documento aparte." Free text, not a checklist — the real
 * limits (β-glucosidasa, GC-MS, LC-MS, pH/°Brix comparativo, microbiología
 * cuantitativa, cupping formal) are the product owner's own list, kept
 * verbatim.
 */
export async function updateDeclaredLimitations(userAccountId: string, experimentId: string, declaredLimitations: string) {
  const experiment = await prisma.experiment.findUnique({ where: { id: experimentId } });
  if (!experiment) throw new ResearchAccessError("experiment_not_found");
  await requireResearchAccess(userAccountId, "approve_protocol", [{ projectId: experiment.projectId }]);

  const updated = await prisma.experiment.update({
    where: { id: experimentId },
    data: { declaredLimitations },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "experiment.update_declared_limitations",
    entityType: "experiment",
    entityId: experimentId,
    after: { declaredLimitations },
    sourceInterface: "research.service",
  });

  return updated;
}
