/**
 * Slice 6 (Sensory Evaluation). Per DOMAIN_MODEL.md, Assessments are
 * immutable once submitted — corrections are new versioned rows
 * (`supersedesAssessmentId`), never an in-place update. There is
 * deliberately no `updateAssessment` function in this file; the schema
 * supports corrections, but building the correction *workflow* UI is out of
 * scope for this slice (DECISIONS.md ADR-030) — `submitAssessment` simply
 * rejects a second submission from the same evaluator for the same sample.
 *
 * Blind-identity access follows RBAC.md §7 literally: every function that
 * would reveal a `SensoryBlindMapping` row requires `blind_mapping:view`,
 * which the "Sensory Judge" Role Profile does not hold — see
 * lib/rbac/catalog.ts.
 */
import { prisma } from "../db";
import { resolvedPermissionKeys } from "../rbac/service";
import { permissionKey } from "../rbac/types";
import type { ScopeTarget } from "../rbac/types";

export class SensoryAccessError extends Error {}

async function grantedKeysForSession(userAccountId: string, sessionId: string): Promise<Set<string>> {
  const target: ScopeTarget = { scopeType: "session", scopeRefId: sessionId };
  return resolvedPermissionKeys(userAccountId, target);
}

/** Sessions this user has an active session-scoped Assignment for — same "assignment scope is the filter" pattern as Partner Workspace (lib/partner/workspace.ts). */
export async function getJudgeSessions(userAccountId: string) {
  const now = new Date();
  const assignments = await prisma.assignment.findMany({
    where: {
      userAccountId,
      status: "active",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      scope: { scopeType: "session" },
    },
    include: { scope: true },
  });

  const sessionIds = [
    ...new Set(assignments.map((a) => a.scope.scopeRefId).filter((id): id is string => id !== null)),
  ];
  if (sessionIds.length === 0) return [];

  return prisma.sensorySession.findMany({
    where: { id: { in: sessionIds } },
    include: { protocolVersion: { include: { protocol: true } } },
    orderBy: { scheduledAt: "desc" },
  });
}

export async function getSessionForJudge(userAccountId: string, sessionId: string) {
  const grantedKeys = await grantedKeysForSession(userAccountId, sessionId);

  const canSubmitAssessment = grantedKeys.has(permissionKey("sensory", "submit_assessment"));
  const canManageSession = grantedKeys.has(permissionKey("sensory", "manage_session"));
  const canViewBlindMapping = grantedKeys.has(permissionKey("blind_mapping", "view"));

  if (!canSubmitAssessment && !canManageSession) {
    throw new SensoryAccessError("no_session_access");
  }

  const session = await prisma.sensorySession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      protocolVersion: { include: { protocol: true, attributes: { orderBy: { displayOrder: "asc" } } } },
      flights: {
        orderBy: { sequenceOrder: "asc" },
        include: {
          blindSamples: {
            orderBy: { blindCode: "asc" },
            include: {
              assessments: {
                where: { evaluatorUserAccountId: userAccountId, status: "submitted" },
              },
            },
          },
        },
      },
    },
  });

  return {
    session,
    canSubmitAssessment,
    canManageSession,
    canViewBlindMapping,
  };
}

export interface SubmitAssessmentInput {
  blindSampleId: string;
  overallScore?: number | null;
  comment?: string | null;
  attributeResponses: ReadonlyArray<{ attributeId: string; value: number; comment?: string | null }>;
}

export async function submitAssessment(userAccountId: string, input: SubmitAssessmentInput) {
  const blindSample = await prisma.sensoryBlindSample.findUnique({
    where: { id: input.blindSampleId },
    include: { flight: true },
  });
  if (!blindSample) throw new SensoryAccessError("blind_sample_not_found");

  const sessionId = blindSample.flight.sessionId;
  const grantedKeys = await grantedKeysForSession(userAccountId, sessionId);
  if (!grantedKeys.has(permissionKey("sensory", "submit_assessment"))) {
    throw new SensoryAccessError("no_session_access");
  }

  const existing = await prisma.assessment.findFirst({
    where: { blindSampleId: input.blindSampleId, evaluatorUserAccountId: userAccountId, status: "submitted" },
  });
  if (existing) {
    throw new SensoryAccessError("already_submitted");
  }

  if (input.attributeResponses.length === 0) {
    throw new SensoryAccessError("responses_required");
  }

  return prisma.assessment.create({
    data: {
      blindSampleId: input.blindSampleId,
      evaluatorUserAccountId: userAccountId,
      overallScore: input.overallScore ?? null,
      comment: input.comment ?? null,
      attributeResponses: {
        create: input.attributeResponses.map((r) => ({
          attributeId: r.attributeId,
          value: r.value,
          comment: r.comment ?? null,
        })),
      },
    },
    include: { attributeResponses: true },
  });
}

export async function getSessionForHeadJudge(userAccountId: string, sessionId: string) {
  const grantedKeys = await grantedKeysForSession(userAccountId, sessionId);
  if (!grantedKeys.has(permissionKey("blind_mapping", "view"))) {
    throw new SensoryAccessError("no_blind_mapping_access");
  }

  const session = await prisma.sensorySession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      protocolVersion: { include: { protocol: true, attributes: { orderBy: { displayOrder: "asc" } } } },
      flights: {
        orderBy: { sequenceOrder: "asc" },
        include: {
          blindSamples: {
            orderBy: { blindCode: "asc" },
            include: {
              blindMapping: { include: { sample: true } },
              assessments: {
                where: { status: "submitted" },
                include: { evaluator: { include: { person: true } }, attributeResponses: true },
              },
              panelResults: { include: { attribute: true } },
            },
          },
        },
      },
    },
  });

  return session;
}

/**
 * Recomputes (delete + recreate, not upsert — a nullable attributeId means
 * Postgres wouldn't enforce "at most one overall row" via a unique
 * constraint alone) PanelResult rows from every current 'submitted'
 * Assessment on this blind sample. CLAUDE.md §28: a derived metric, stored
 * with its method and computation time, never hand-edited.
 */
export async function computePanelResult(userAccountId: string, blindSampleId: string) {
  const blindSample = await prisma.sensoryBlindSample.findUnique({
    where: { id: blindSampleId },
    include: { flight: true },
  });
  if (!blindSample) throw new SensoryAccessError("blind_sample_not_found");

  const grantedKeys = await grantedKeysForSession(userAccountId, blindSample.flight.sessionId);
  if (!grantedKeys.has(permissionKey("sensory", "manage_session"))) {
    throw new SensoryAccessError("no_session_access");
  }

  const assessments = await prisma.assessment.findMany({
    where: { blindSampleId, status: "submitted" },
    include: { attributeResponses: true },
  });

  return prisma.$transaction(async (tx) => {
    await tx.panelResult.deleteMany({ where: { blindSampleId } });

    const rows: { attributeId: string | null; values: number[] }[] = [];

    const overallValues = assessments
      .map((a) => a.overallScore)
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .map((v) => v.toNumber());
    if (overallValues.length > 0) {
      rows.push({ attributeId: null, values: overallValues });
    }

    const byAttribute = new Map<string, number[]>();
    for (const assessment of assessments) {
      for (const response of assessment.attributeResponses) {
        const list = byAttribute.get(response.attributeId) ?? [];
        list.push(response.value.toNumber());
        byAttribute.set(response.attributeId, list);
      }
    }
    for (const [attributeId, values] of byAttribute) {
      rows.push({ attributeId, values });
    }

    const created = [];
    for (const row of rows) {
      const mean = row.values.reduce((sum, v) => sum + v, 0) / row.values.length;
      created.push(
        await tx.panelResult.create({
          data: {
            blindSampleId,
            attributeId: row.attributeId,
            responseCount: row.values.length,
            meanValue: mean,
            minValue: Math.min(...row.values),
            maxValue: Math.max(...row.values),
          },
        }),
      );
    }
    return created;
  });
}
