/**
 * RO1 (docs/implementation/34_RO1_RESEARCH_OS.md §2, §5). AnalysisPlan ->
 * AnalysisRun -> AnalysisResult, Publication, Deviation ->
 * CorrectiveAction, Approval. §5 explicitly excludes screens for all of
 * these — "el esquema existe; las pantallas llegan cuando se usen" — so
 * this file is schema-backed service functions only, no UI wiring.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireResearchAccess, ResearchAccessError } from "./access";

export async function createAnalysisPlan(userAccountId: string, experimentId: string, planText: string) {
  const experiment = await prisma.experiment.findUnique({ where: { id: experimentId } });
  if (!experiment) throw new ResearchAccessError("experiment_not_found");
  await requireResearchAccess(userAccountId, "approve_protocol", [{ projectId: experiment.projectId }]);

  // La escritura y su AuditEvent en la misma transacción desde el 2026-09-06.
  // Antes eran dos llamadas sueltas: el plan confirmaba y, si el audit fallaba
  // después, quedaba un hecho sin rastro. Ver la cabecera de `lib/audit.ts`.
  return prisma.$transaction(async (tx) => {
    const plan = await tx.analysisPlan.create({
      data: { experimentId, planText, createdBy: userAccountId },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "analysis_plan.create",
        entityType: "analysis_plan",
        entityId: plan.id,
        after: plan,
        sourceInterface: "research.service",
      },
      tx,
    );
    return plan;
  });
}

export async function createAnalysisRun(userAccountId: string, analysisPlanId: string) {
  const plan = await prisma.analysisPlan.findUnique({ where: { id: analysisPlanId }, include: { experiment: true } });
  if (!plan) throw new ResearchAccessError("analysis_plan_not_found");
  await requireResearchAccess(userAccountId, "create_evidence", [{ projectId: plan.experiment.projectId }]);

  return prisma.$transaction(async (tx) => {
    const run = await tx.analysisRun.create({
      data: { analysisPlanId, status: "pending", createdBy: userAccountId },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "analysis_run.create",
        entityType: "analysis_run",
        entityId: run.id,
        after: run,
        sourceInterface: "research.service",
      },
      tx,
    );
    return run;
  });
}

export async function recordAnalysisResult(
  userAccountId: string,
  input: { analysisRunId: string; resultSummary: string; resultData?: unknown },
) {
  const run = await prisma.analysisRun.findUnique({
    where: { id: input.analysisRunId },
    include: { analysisPlan: { include: { experiment: true } } },
  });
  if (!run) throw new ResearchAccessError("analysis_run_not_found");
  await requireResearchAccess(userAccountId, "create_evidence", [{ projectId: run.analysisPlan.experiment.projectId }]);

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.analysisResult.create({
      data: {
        analysisRunId: input.analysisRunId,
        resultSummary: input.resultSummary,
        resultData: input.resultData === undefined ? undefined : (input.resultData as object),
        createdBy: userAccountId,
      },
    });
    await tx.analysisRun.update({ where: { id: input.analysisRunId }, data: { status: "completed", endedAt: new Date() } });

    // Dentro de la transacción y con `tx` desde el 2026-09-06: el resultado y
    // el cierre de la corrida se confirman juntos, y su AuditEvent con ellos.
    // Ver la cabecera de `lib/audit.ts`.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "analysis_result.create",
        entityType: "analysis_result",
        entityId: created.id,
        after: created,
        sourceInterface: "research.service",
      },
      tx,
    );

    return created;
  });

  return result;
}

export async function createPublication(userAccountId: string, input: { experimentId?: string | null; title: string }) {
  let projectId: string | null = null;
  if (input.experimentId) {
    const experiment = await prisma.experiment.findUnique({ where: { id: input.experimentId } });
    if (!experiment) throw new ResearchAccessError("experiment_not_found");
    projectId = experiment.projectId;
  }
  await requireResearchAccess(userAccountId, "approve_protocol", [{ projectId }]);

  return prisma.$transaction(async (tx) => {
    const publication = await tx.publication.create({
      data: { experimentId: input.experimentId ?? null, title: input.title, status: "draft", createdBy: userAccountId },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "publication.create",
        entityType: "publication",
        entityId: publication.id,
        after: publication,
        sourceInterface: "research.service",
      },
      tx,
    );
    return publication;
  });
}

export interface RecordDeviationInput {
  treatmentBatchId?: string | null;
  processingStageId?: string | null;
  description: string;
  occurredAt: Date;
  severity?: string | null;
}

export async function recordDeviation(userAccountId: string, input: RecordDeviationInput) {
  if (!input.treatmentBatchId && !input.processingStageId) {
    throw new ResearchAccessError("deviation_requires_treatment_batch_or_processing_stage");
  }
  let projectId: string | null = null;
  if (input.treatmentBatchId) {
    const batch = await prisma.treatmentBatch.findUnique({ where: { id: input.treatmentBatchId } });
    if (!batch) throw new ResearchAccessError("treatment_batch_not_found");
    projectId = batch.projectId;
  } else if (input.processingStageId) {
    const stage = await prisma.processingStage.findUnique({ where: { id: input.processingStageId }, include: { treatmentBatch: true } });
    if (!stage) throw new ResearchAccessError("processing_stage_not_found");
    projectId = stage.treatmentBatch.projectId;
  }
  await requireResearchAccess(userAccountId, "create_evidence", [{ projectId }]);

  return prisma.$transaction(async (tx) => {
    const deviation = await tx.deviation.create({
      data: {
        treatmentBatchId: input.treatmentBatchId ?? null,
        processingStageId: input.processingStageId ?? null,
        description: input.description,
        occurredAt: input.occurredAt,
        severity: input.severity ?? null,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "deviation.create",
        entityType: "deviation",
        entityId: deviation.id,
        after: deviation,
        sourceInterface: "research.service",
      },
      tx,
    );

    return deviation;
  });
}

export async function recordCorrectiveAction(userAccountId: string, deviationId: string, actionText: string, takenAt?: Date | null) {
  const deviation = await prisma.deviation.findUnique({
    where: { id: deviationId },
    include: { treatmentBatch: true, processingStage: { include: { treatmentBatch: true } } },
  });
  if (!deviation) throw new ResearchAccessError("deviation_not_found");
  const projectId = deviation.treatmentBatch?.projectId ?? deviation.processingStage?.treatmentBatch.projectId ?? null;
  await requireResearchAccess(userAccountId, "create_evidence", [{ projectId }]);

  return prisma.$transaction(async (tx) => {
    const action = await tx.correctiveAction.create({
      data: { deviationId, actionText, takenAt: takenAt ?? null, createdBy: userAccountId },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "corrective_action.create",
        entityType: "corrective_action",
        entityId: action.id,
        after: action,
        sourceInterface: "research.service",
      },
      tx,
    );

    return action;
  });
}

/**
 * ADR-020 decision 8 would normally call for a specific nullable FK per
 * target; Approval is the one deliberate exception (see the schema's own
 * comment on the model) — entityType/entityId identify what was approved.
 * No project-scoped RBAC check here (the target may be any research
 * object type); approve_protocol is required unconditionally, matching
 * this being an authoring/approval act, not an execution one.
 */
export async function recordApproval(
  userAccountId: string,
  input: { entityType: string; entityId: string; decision: "approved" | "rejected"; notes?: string | null },
) {
  await requireResearchAccess(userAccountId, "approve_protocol", [{}]);

  return prisma.$transaction(async (tx) => {
    const approval = await tx.approval.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        approverUserAccountId: userAccountId,
        decision: input.decision,
        decidedAt: new Date(),
        notes: input.notes ?? null,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "approval.create",
        entityType: "approval",
        entityId: approval.id,
        after: approval,
        sourceInterface: "research.service",
      },
      tx,
    );

    return approval;
  });
}
