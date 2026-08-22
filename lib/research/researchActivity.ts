/**
 * RO1 §6 — RESEARCH_ACTIVITY_CRITERIA.md's substance-test gate. "Que el
 * modelo soporte ese gate ... Construilo; no lo apliques": this file is
 * that support. Nothing here blocks CryoBloom/gastro-tourism activity work
 * (RESEARCH_ACTIVITY_CRITERIA.md §9's own bar, executed by human review,
 * out of scope for RO1) — proposeResearchActivity/reviewResearchActivity
 * exist so a future screen or script can drive the gate, not to enforce it
 * against existing activities today.
 */
import { prisma } from "../db";
import { can, CLASSIFICATION_NOT_APPLICABLE } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { ResearchAccessError } from "./access";

export class ResearchActivityValidationError extends Error {}

export interface ProposeResearchActivityInput {
  name: string;
  description?: string | null;
  researchProgramId?: string | null;
  isPaid: boolean;
  // RESEARCH_ACTIVITY_CRITERIA.md's five-part substance test, structured —
  // kept as the caller's own shape (the criteria doc's own checklist,
  // still evolving), not five separate columns.
  researchQuestionStructured?: unknown;
  publicListingCopy?: string | null;
  consentFormCopy?: string | null;
}

export async function proposeResearchActivity(userAccountId: string, input: ProposeResearchActivityInput) {
  const activity = await prisma.researchActivity.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      researchProgramId: input.researchProgramId ?? null,
      isPaid: input.isPaid,
      researchQuestionStructured: input.researchQuestionStructured === undefined ? undefined : (input.researchQuestionStructured as object),
      publicListingCopy: input.publicListingCopy ?? null,
      consentFormCopy: input.consentFormCopy ?? null,
      complianceStatus: "pending_review",
      proposedByUserAccountId: userAccountId,
      createdBy: userAccountId,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "research_activity.propose",
    entityType: "research_activity",
    entityId: activity.id,
    after: activity,
    sourceInterface: "research.service",
  });

  return activity;
}

/**
 * RESEARCH_ACTIVITY_CRITERIA.md §4's "no auto-revisión" — structural, not
 * just a permission check: even a Research Compliance Reviewer cannot
 * review an activity they themselves proposed. Same mechanism RBAC.md §7
 * already uses for blind-judge restrictions (a permission grant alone
 * doesn't encode who's disqualified from a specific row; this function
 * does).
 */
export async function canReviewResearchActivity(reviewerUserAccountId: string, researchActivityId: string): Promise<boolean> {
  const activity = await prisma.researchActivity.findUnique({ where: { id: researchActivityId } });
  if (!activity) return false;
  if (activity.proposedByUserAccountId === reviewerUserAccountId) return false;
  return can(reviewerUserAccountId, "review", "research_activity", { scopeType: "platform", scopeRefId: null }, CLASSIFICATION_NOT_APPLICABLE);
}

export async function reviewResearchActivity(
  userAccountId: string,
  input: { researchActivityId: string; decision: "approved" | "rejected" | "recategorized"; reviewNotes?: string | null },
) {
  const allowed = await canReviewResearchActivity(userAccountId, input.researchActivityId);
  if (!allowed) throw new ResearchAccessError("cannot_review_own_proposal_or_not_authorized");

  const updated = await prisma.researchActivity.update({
    where: { id: input.researchActivityId },
    data: {
      complianceStatus: input.decision,
      reviewedByUserAccountId: userAccountId,
      reviewedAt: new Date(),
      reviewNotes: input.reviewNotes ?? null,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "research_activity.review",
    entityType: "research_activity",
    entityId: updated.id,
    after: updated,
    reason: input.reviewNotes ?? undefined,
    sourceInterface: "research.service",
  });

  return updated;
}
