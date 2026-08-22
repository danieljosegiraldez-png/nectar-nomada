/**
 * RBAC.md §3-4 — the permission resolution algorithm.
 *
 * Pure functions, no I/O. Scope containment flows only *downward* from
 * platform/program (RBAC.md §3): a narrower scope never implies a broader
 * one. This is what makes "contextual assignments narrow, never broaden"
 * (CLAUDE.md §10) an enforced property instead of a review guideline.
 */

import type { AssignmentScope, ClassificationLevel, ResolvedAssignment, ScopeTarget } from "./types";
import { permissionKey } from "./types";

/**
 * Does an Assignment's scope cover the target resource's location?
 *
 * - platform: always.
 * - program: covers the same Program, and any Project whose parentProgramId
 *   matches — but does not cover leaf scopes (location/competition/session/
 *   experience) even if those leaf entities happen to relate to a Project
 *   under this Program. Leaf scopes are granted only by an exact match.
 * - project / location / competition / session / experience: exact identity
 *   only. A Project assignment never covers its parent Program, siblings,
 *   or any leaf scope.
 */
export function scopeContains(assignmentScope: AssignmentScope, target: ScopeTarget): boolean {
  if (assignmentScope.scopeType === "platform") {
    return true;
  }

  if (assignmentScope.scopeType === "program") {
    if (target.scopeType === "program") {
      return assignmentScope.scopeRefId === target.scopeRefId;
    }
    if (target.scopeType === "project") {
      return (
        target.parentProgramId != null && assignmentScope.scopeRefId === target.parentProgramId
      );
    }
    return false;
  }

  // project and every leaf scope type: exact identity only, no inheritance.
  return (
    assignmentScope.scopeType === target.scopeType && assignmentScope.scopeRefId === target.scopeRefId
  );
}

/** Union of every permission granted to the target by any of the user's active assignments. */
export function resolvePermissions(assignments: readonly ResolvedAssignment[], target: ScopeTarget): Set<string> {
  const granted = new Set<string>();
  for (const assignment of assignments) {
    if (!scopeContains(assignment.scope, target)) continue;
    for (const [resourceType, action] of assignment.permissions) {
      granted.add(permissionKey(resourceType, action));
    }
  }
  return granted;
}

/**
 * RBAC.md §4 step 4 — classification is an independent AND-gate, never
 * folded into the base permission set. A resource above `public` requires
 * the matching `classification:clear_<level>` permission in addition to the
 * action permission itself, regardless of what that action is (view, edit,
 * approve, ...).
 */
/**
 * The classification an access check passes when the gate is deliberately not
 * being applied to that resource yet.
 *
 * It evaluates to `public`, so behaviour is identical to the old default — but
 * it is *named*, which the default was not. Every site that is not yet gated
 * is greppable:
 *
 *     grep -rn CLASSIFICATION_GATE_DEFERRED lib app
 *
 * That list is the live inventory of unenforced classification, and it should
 * only ever shrink. See ADR-062: the gate is fully specified, implemented,
 * seeded and stored on four models, and was applied at zero of thirteen call
 * sites — because the old `= "public"` default made omission invisible.
 */
export const CLASSIFICATION_GATE_DEFERRED: ClassificationLevel = "public";

export function can(
  assignments: readonly ResolvedAssignment[],
  action: string,
  resourceType: string,
  target: ScopeTarget,
  // Required, deliberately. A default here is what let thirteen call sites
  // silently skip the AND-gate; making it explicit turns omission into a
  // compile error rather than an invisible bypass.
  resourceClassification: ClassificationLevel,
): boolean {
  const granted = resolvePermissions(assignments, target);

  if (!granted.has(permissionKey(resourceType, action))) {
    return false;
  }

  if (resourceClassification === "public") {
    return true;
  }

  return granted.has(permissionKey("classification", `clear_${resourceClassification}`));
}
