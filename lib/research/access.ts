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

/**
 * ¿Puede esta cuenta ver investigación en alguna parte? Es `requireResearchAccess`
 * contestado con un booleano en vez de con una excepción.
 *
 * **Para qué existe (Daniel, 2026-09-27).** Su regla: lo que no puedes hacer no se
 * muestra, y no se explica. `/research` ofrecía «nueva» a cualquiera, y quien no
 * tiene acceso se topaba con un **500** —la excepción de abajo, sin atrapar, desde
 * `listVariableCatalogs`—. Para omitir el enlace hace falta preguntar sin reventar.
 *
 * Mismo criterio y mismo recorrido que el guardia: se delega en él y se atrapa su
 * error, para que las dos respuestas no puedan divergir.
 */
export async function puedeVerInvestigacion(userAccountId: string): Promise<boolean> {
  try {
    await requireResearchAccess(userAccountId, "view", [{}]);
    return true;
  } catch (e) {
    if (e instanceof ResearchAccessError) return false;
    throw e;
  }
}

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
