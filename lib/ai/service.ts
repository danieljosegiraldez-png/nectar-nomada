/**
 * Slice 7 (AI). Implements AI_GOVERNANCE.md §4's loop literally:
 * "AI Suggestion → Evidence/Reason → Human Review → Accept/Reject/Modify →
 * Action → Audit Record." Two halves, deliberately separated by which
 * Prisma client they use:
 *
 * - `generate*` functions run as the restricted `ai_service` role
 *   (lib/ai/db.ts) and can only ever INSERT into `Recommendation` —
 *   enforced at the database layer, not just by not calling other
 *   functions.
 * - Everything else (listing, reviewing, deciding) runs as the reviewing
 *   human's own request, through the normal `prisma` client, RBAC-checked
 *   like any other write in this codebase (SECURITY.md §2).
 *
 * No real LLM provider is wired up in this slice — there is no API key to
 * call one, and inventing a fake call would misrepresent what's actually
 * happening. `generateDataCompletenessSuggestions` is a genuine, working
 * rule-based generator (`model: "rule-based-completeness-checker-v1"`), not
 * a stand-in for an LLM call. Swapping in a real model later only touches
 * this one function — the suggestion lifecycle, RBAC gating, and audit
 * trail around it don't change (INTEGRATIONS.md §7 / AI_GOVERNANCE.md §8's
 * provider-independence principle).
 */
import { prisma } from "../db";
import { aiPrisma } from "./db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";

export class AiAccessError extends Error {}

const MODEL_NAME = "rule-based-completeness-checker-v1";

/**
 * Scans public Projects for a missing description — a concrete, narrow
 * instance of AI_GOVERNANCE.md §1's "identify missing information"
 * capability. Idempotent: skips a Project that already has a pending
 * suggestion of this type, so re-running doesn't pile up duplicates.
 */
export async function generateDataCompletenessSuggestions(): Promise<number> {
  const projectsMissingDescription = await prisma.project.findMany({
    where: { OR: [{ description: null }, { description: "" }] },
    select: { id: true, name: true },
  });

  let created = 0;
  for (const project of projectsMissingDescription) {
    const existingPending = await aiPrisma.recommendation.findFirst({
      where: {
        suggestionType: "project_missing_description",
        relatedEntityType: "project",
        relatedEntityId: project.id,
        status: "pending",
      },
    });
    if (existingPending) continue;

    await aiPrisma.recommendation.create({
      data: {
        suggestionType: "project_missing_description",
        model: MODEL_NAME,
        recommendation: `Project "${project.name}" has no description. Consider adding one before it's shown more prominently on Discover.`,
        context: { projectId: project.id, projectName: project.name },
        supportingEvidence: { rule: "project.description IS NULL OR project.description = ''" },
        relatedEntityType: "project",
        relatedEntityId: project.id,
      },
    });
    created += 1;
  }

  return created;
}

async function requireReviewPermission(userAccountId: string) {
  const allowed = await can(userAccountId, "review_suggestion", "ai", { scopeType: "platform", scopeRefId: null });
  if (!allowed) {
    throw new AiAccessError("no_review_access");
  }
}

/**
 * Platform-scope gate only — deliberately simplified for this slice.
 * `related_entity_type` spans every module, and fully generic per-entity
 * scoping (resolve each suggestion's own scope target before checking
 * access) is a larger undertaking than this slice needs; a platform- or
 * program-scoped Assignment holding `ai:review_suggestion` is required to
 * see anything, same simplification already made for Partner Workspace
 * visibility (lib/partner/workspace.ts).
 */
export async function getPendingSuggestions(userAccountId: string) {
  await requireReviewPermission(userAccountId);
  return prisma.recommendation.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "desc" },
  });
}

export async function getReviewedSuggestions(userAccountId: string) {
  await requireReviewPermission(userAccountId);
  return prisma.recommendation.findMany({
    where: { status: { not: "pending" } },
    include: { reviewer: { include: { person: true } } },
    orderBy: { decisionAt: "desc" },
    take: 20,
  });
}

export type SuggestionDecision = "accepted" | "rejected" | "modified";

export interface DecideSuggestionInput {
  recommendationId: string;
  decision: SuggestionDecision;
  actionTaken?: string | null;
}

/**
 * The human's decision itself — never the AI's. Writes through the normal
 * `prisma` client (the reviewer's own request), sets reviewer/decisionAt,
 * and records a mandatory AuditEvent (SECURITY.md §6 — permission-adjacent
 * decisions are always audited). This function does not apply the
 * suggestion's content anywhere; "accept" records that a human reviewed
 * and agreed with it, the actual follow-up edit happens through whatever
 * surface already exists for that entity (e.g. editing the Project
 * directly), consistent with AI_GOVERNANCE.md §3's requirement that the
 * real write always be the human's own action, never something this
 * function performs on the AI's behalf.
 */
export async function decideSuggestion(userAccountId: string, input: DecideSuggestionInput) {
  await requireReviewPermission(userAccountId);

  const before = await prisma.recommendation.findUnique({ where: { id: input.recommendationId } });
  if (!before) throw new AiAccessError("not_found");
  if (before.status !== "pending") throw new AiAccessError("already_decided");

  const after = await prisma.recommendation.update({
    where: { id: input.recommendationId },
    data: {
      status: input.decision,
      reviewerUserAccountId: userAccountId,
      decisionAt: new Date(),
      actionTaken: input.actionTaken ?? null,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: `recommendation.${input.decision}`,
    entityType: "recommendation",
    entityId: after.id,
    before,
    after,
    sourceInterface: "ai.service",
  });

  return after;
}
