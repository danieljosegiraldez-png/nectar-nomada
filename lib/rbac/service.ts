/**
 * SECURITY.md §2 — the single server-side authorization choke point.
 * Every route/action that needs a permission check imports `can` (or
 * `canManageOwnProfile`) from here — nothing queries Assignment/Scope/
 * RoleProfile tables directly outside this file, so the "narrow, never
 * broaden" guarantee in resolve.ts stays enforced in one place.
 */

import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can as resolveCan, resolvePermissions as resolvePermissionsPure } from "./resolve";
import { permissionKey } from "./types";
export { CLASSIFICATION_GATE_DEFERRED, CLASSIFICATION_NOT_APPLICABLE } from "./resolve";
import type { ClassificationLevel, ResolvedAssignment, ScopeTarget, ScopeType } from "./types";

async function getResolvedAssignments(userAccountId: string): Promise<ResolvedAssignment[]> {
  const now = new Date();

  const rows = await prisma.assignment.findMany({
    where: {
      userAccountId,
      status: "active",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
    include: {
      scope: true,
      roleProfile: {
        include: { permissions: { include: { permission: true } } },
      },
    },
  });

  return rows.map((row): ResolvedAssignment => ({
    id: row.id,
    scope: {
      scopeType: row.scope.scopeType as ScopeType,
      scopeRefId: row.scope.scopeRefId,
    },
    permissions: row.roleProfile.permissions.map(
      (rp) => [rp.permission.resourceType, rp.permission.action] as const,
    ),
  }));
}

/**
 * RBAC.md §4 — full chain resolution for one user against one target.
 * Returns `false` for an unauthenticated caller (`userAccountId == null`) —
 * there is no default-allow anywhere in this chain.
 */
export async function can(
  userAccountId: string | null,
  action: string,
  resourceType: string,
  target: ScopeTarget,
  // Required — see resolve.ts's note. Pass CLASSIFICATION_GATE_DEFERRED where
  // the gate is knowingly not applied yet, never a bare "public".
  resourceClassification: ClassificationLevel,
): Promise<boolean> {
  if (!userAccountId) return false;
  const assignments = await getResolvedAssignments(userAccountId);
  return resolveCan(assignments, action, resourceType, target, resourceClassification);
}

/** Every permission key an authenticated user holds against one target — for building UI affordances, not for enforcement (enforcement is always a `can()` call server-side, per SECURITY.md §2). */
export async function resolvedPermissionKeys(userAccountId: string, target: ScopeTarget): Promise<Set<string>> {
  const assignments = await getResolvedAssignments(userAccountId);
  return resolvePermissionsPure(assignments, target);
}

/**
 * Every permission key the user holds under ANY active assignment, whatever
 * its scope.
 *
 * S2 §4 needs this and nothing else does: navigation asks "is there anywhere
 * this person could use this section?", which no single-target resolution can
 * answer — a farm operator's `lot:manage` lives on a project scope and is
 * invisible to a platform-scoped query, yet they plainly should see Lots.
 *
 * **Display only, and never an authorization decision.** It answers "offer
 * this link" and deliberately cannot answer "may they act on this row" —
 * that stays a `can()` call against the specific target, per SECURITY.md §2.
 * The union is strictly wider than any single scope, so using it to authorize
 * would broaden exactly what resolve.ts exists to keep narrow.
 */
export async function permissionKeysAnywhere(userAccountId: string): Promise<Set<string>> {
  const assignments = await getResolvedAssignments(userAccountId);
  const granted = new Set<string>();
  for (const assignment of assignments) {
    for (const [resourceType, action] of assignment.permissions) {
      granted.add(permissionKey(resourceType, action));
    }
  }
  return granted;
}

/**
 * RBAC.md §5 — every authenticated UserAccount can always view/edit their
 * own Person/UserAccount record. This is a baseline, not an Assignment
 * grant, and deliberately bypasses scope resolution — "is this my own
 * record" is a different authorization primitive than "does my Assignment
 * cover this scope."
 */
export function canManageOwnProfile(requestingUserAccountId: string | null, targetUserAccountId: string): boolean {
  return requestingUserAccountId !== null && requestingUserAccountId === targetUserAccountId;
}

export interface CreateAssignmentInput {
  userAccountId: string;
  roleProfileId: string;
  scopeId: string;
  validFrom?: Date;
  validTo?: Date | null;
}

/** RBAC.md §8 — Assignment creation is always audited. */
export async function createAssignment(input: CreateAssignmentInput, actorUserAccountId: string | null) {
  const assignment = await prisma.assignment.create({
    data: {
      userAccountId: input.userAccountId,
      roleProfileId: input.roleProfileId,
      scopeId: input.scopeId,
      grantedBy: actorUserAccountId,
      validFrom: input.validFrom ?? new Date(),
      validTo: input.validTo ?? null,
    },
  });

  await recordAuditEvent({
    actorUserAccountId,
    operation: "assignment.create",
    entityType: "assignment",
    entityId: assignment.id,
    after: assignment,
    sourceInterface: "rbac.service",
  });

  return assignment;
}

/** RBAC.md §8 — Assignment revocation is always audited. */
export async function revokeAssignment(assignmentId: string, actorUserAccountId: string | null, reason?: string) {
  const before = await prisma.assignment.findUniqueOrThrow({ where: { id: assignmentId } });

  const after = await prisma.assignment.update({
    where: { id: assignmentId },
    data: { status: "revoked", validTo: new Date() },
  });

  await recordAuditEvent({
    actorUserAccountId,
    operation: "assignment.revoke",
    entityType: "assignment",
    entityId: assignmentId,
    before,
    after,
    reason,
    sourceInterface: "rbac.service",
  });

  return after;
}
