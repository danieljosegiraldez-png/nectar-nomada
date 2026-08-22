/**
 * RO1 (docs/implementation/34_RO1_RESEARCH_OS.md). Shared RBAC helper for
 * every Research OS write/read below — same "try every scope target a
 * candidate carries, never just one" shape as
 * lib/traceability/lots.ts's requireLotAccess, reusing its scopeTargetsFor
 * rather than re-deriving it.
 */
import { prisma } from "../db";
import { can, CLASSIFICATION_NOT_APPLICABLE } from "../rbac/service";
import { scopeTargetsFor } from "../traceability/lots";
import type { ClassificationLevel } from "../../generated/prisma/client";

export class ResearchAccessError extends Error {}

export type ResearchAction = "view" | "create_measurement" | "create_evidence" | "approve_protocol" | "execute_protocol";

export async function requireResearchAccess(
  userAccountId: string,
  action: ResearchAction,
  candidates: ReadonlyArray<{ projectId?: string | null; locationId?: string | null }>,
) {
  // A research record — an Experiment, a Measurement, a Protocol — carries no
  // classification of its own. The Project or Location it belongs to does, and
  // that is what declares how sensitive the work is (ADR-068).
  //
  // Loaded in two queries up front rather than per candidate: this runs on
  // every research read, and the candidate list can hold several rows pointing
  // at the same project.
  const projectIds = [...new Set(candidates.map((c) => c.projectId).filter((id): id is string => Boolean(id)))];
  const locationIds = [...new Set(candidates.map((c) => c.locationId).filter((id): id is string => Boolean(id)))];

  const [projects, locations] = await Promise.all([
    projectIds.length
      ? prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, classification: true } })
      : Promise.resolve([]),
    locationIds.length
      ? prisma.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, classification: true } })
      : Promise.resolve([]),
  ]);
  const classificationOf = new Map<string, ClassificationLevel>([
    ...projects.map((p) => [p.id, p.classification] as const),
    ...locations.map((l) => [l.id, l.classification] as const),
  ]);

  for (const candidate of candidates) {
    for (const target of scopeTargetsFor(candidate)) {
      let classification: ClassificationLevel;

      if (target.scopeRefId === null) {
        // scopeTargetsFor only emits a platform target when the candidate has
        // neither a project nor a location — so there is no record whose
        // sensitivity could gate this, and `public` is the final answer.
        classification = CLASSIFICATION_NOT_APPLICABLE;
      } else {
        const found = classificationOf.get(target.scopeRefId);
        // A target pointing at a record that could not be loaded is skipped,
        // never treated as public: defaulting a missing record to the most
        // permissive level is how a gate gets bypassed by a stale id.
        if (!found) continue;
        classification = found;
      }

      if (await can(userAccountId, action, "research", target, classification)) return;
    }
  }
  throw new ResearchAccessError("no_research_access");
}
