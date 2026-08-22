/**
 * RO1 (docs/implementation/34_RO1_RESEARCH_OS.md). Shared RBAC helper for
 * every Research OS write/read below — same "try every scope target a
 * candidate carries, never just one" shape as
 * lib/traceability/lots.ts's requireLotAccess, reusing its scopeTargetsFor
 * rather than re-deriving it.
 */
import { can } from "../rbac/service";
import { classificationForTarget, loadScopeClassifications } from "../rbac/scopeClassification";
import { scopeTargetsFor } from "../traceability/lots";

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
  const classifications = await loadScopeClassifications(candidates);

  for (const candidate of candidates) {
    for (const target of scopeTargetsFor(candidate)) {
      const classification = classificationForTarget(target, classifications);
      if (classification === null) continue;
      if (await can(userAccountId, action, "research", target, classification)) return;
    }
  }
  throw new ResearchAccessError("no_research_access");
}
