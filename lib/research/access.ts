/**
 * RO1 (docs/implementation/34_RO1_RESEARCH_OS.md). Shared RBAC helper for
 * every Research OS write/read below — same "try every scope target a
 * candidate carries, never just one" shape as
 * lib/traceability/lots.ts's requireLotAccess, reusing its scopeTargetsFor
 * rather than re-deriving it.
 */
import { can, CLASSIFICATION_GATE_DEFERRED } from "../rbac/service";
import { scopeTargetsFor } from "../traceability/lots";

export class ResearchAccessError extends Error {}

export type ResearchAction = "view" | "create_measurement" | "create_evidence" | "approve_protocol" | "execute_protocol";

export async function requireResearchAccess(
  userAccountId: string,
  action: ResearchAction,
  candidates: ReadonlyArray<{ projectId?: string | null; locationId?: string | null }>,
) {
  for (const candidate of candidates) {
    for (const target of scopeTargetsFor(candidate)) {
      if (await can(userAccountId, action, "research", target, CLASSIFICATION_GATE_DEFERRED)) return;
    }
  }
  throw new ResearchAccessError("no_research_access");
}
