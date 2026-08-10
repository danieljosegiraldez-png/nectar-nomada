/**
 * Competitions (CLAUDE.md §29-30, DOMAIN_MODEL.md "Competitions"). This
 * service deliberately does NOT reimplement blind coding, assessment
 * submission, or panel-result computation — that's entirely
 * lib/sensory/service.ts, unchanged, via the CompetitionCategory →
 * SensorySession link. What's here is the workflow layer on top: listing,
 * finalizing a competition's official result from the underlying Sensory
 * PanelResult, and declaring an award.
 *
 * Simplification, stated plainly: Competition/Edition/Category carry no
 * classification field in this slice (unlike every other module). Nothing
 * here has a public-facing "browse competitions" surface yet that would
 * need one — `getCompetitionsWithEditions`/`getEditionDetail` are gated by
 * `competition:manage`, same as the rest of this service. If a public
 * results/entry-list surface is ever built, classification should be added
 * at that point, not assumed unnecessary.
 */
import { prisma } from "../db";
import { can } from "../rbac/service";

export class CompetitionAccessError extends Error {}

async function requireManagePermission(userAccountId: string) {
  const allowed = await can(userAccountId, "manage", "competition", { scopeType: "platform", scopeRefId: null });
  if (!allowed) {
    throw new CompetitionAccessError("no_manage_access");
  }
}

export async function getCompetitionsWithEditions(userAccountId: string) {
  await requireManagePermission(userAccountId);
  return prisma.competition.findMany({
    include: { editions: { orderBy: { createdAt: "desc" } } },
    orderBy: { name: "asc" },
  });
}

export async function getEditionDetail(userAccountId: string, editionId: string) {
  await requireManagePermission(userAccountId);
  return prisma.competitionEdition.findUniqueOrThrow({
    where: { id: editionId },
    include: {
      competition: true,
      categories: {
        include: {
          sensoryProtocolVersion: { include: { protocol: true } },
          sensorySession: true,
          entries: {
            include: {
              sample: true,
              competitorPerson: true,
              competitorOrganization: true,
              result: { include: { award: true } },
            },
          },
        },
      },
    },
  });
}

/**
 * Reads the Sensory PanelResult's overall-score aggregate (attributeId:
 * null) for the SensoryBlindSample that maps back to this Entry's Sample
 * within the category's judging session, and records it as the
 * competition's official finalScore — a distinct, audited act (CLAUDE.md
 * §32: nobody silently changes a competition result), never an edit to the
 * underlying Assessment/PanelResult rows themselves.
 */
export async function finalizeResult(userAccountId: string, entryId: string) {
  await requireManagePermission(userAccountId);

  const entry = await prisma.entry.findUniqueOrThrow({
    where: { id: entryId },
    include: { category: true },
  });

  if (!entry.category.sensorySessionId) {
    throw new CompetitionAccessError("category_not_judging_yet");
  }

  const blindMapping = await prisma.sensoryBlindMapping.findFirst({
    where: {
      sampleId: entry.sampleId,
      blindSample: { flight: { sessionId: entry.category.sensorySessionId } },
    },
  });
  if (!blindMapping) {
    throw new CompetitionAccessError("not_blind_coded_yet");
  }

  const overallPanelResult = await prisma.panelResult.findFirst({
    where: { blindSampleId: blindMapping.blindSampleId, attributeId: null },
  });
  if (!overallPanelResult) {
    throw new CompetitionAccessError("panel_result_not_computed_yet");
  }

  const result = await prisma.competitionResult.upsert({
    where: { entryId },
    create: {
      entryId,
      blindSampleId: blindMapping.blindSampleId,
      finalScore: overallPanelResult.meanValue,
      status: "finalized",
      finalizedByUserAccountId: userAccountId,
      finalizedAt: new Date(),
    },
    update: {
      finalScore: overallPanelResult.meanValue,
      status: "finalized",
      finalizedByUserAccountId: userAccountId,
      finalizedAt: new Date(),
    },
  });

  await prisma.entry.update({ where: { id: entryId }, data: { status: "judged" } });

  return result;
}

export async function declareAward(userAccountId: string, resultId: string, name: string) {
  await requireManagePermission(userAccountId);

  if (!name.trim()) {
    throw new CompetitionAccessError("award_name_required");
  }

  const result = await prisma.competitionResult.findUniqueOrThrow({ where: { id: resultId } });
  if (result.status !== "finalized") {
    throw new CompetitionAccessError("result_not_finalized");
  }

  return prisma.award.upsert({
    where: { resultId },
    create: { resultId, name: name.trim() },
    update: { name: name.trim() },
  });
}
