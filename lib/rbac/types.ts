/**
 * RBAC.md §2-3 — types for the pure resolution engine (resolve.ts).
 * Deliberately independent of Prisma's generated types so the resolution
 * algorithm can be unit tested without a database (RBAC.md §9).
 */

export type ScopeType =
  | "platform"
  | "program"
  | "project"
  | "location"
  | "competition"
  | "session"
  | "experience";

export const CLASSIFICATION_LEVELS = [
  "public",
  "registered",
  "partner",
  "internal",
  "confidential",
  "trade_secret",
] as const;

export type ClassificationLevel = (typeof CLASSIFICATION_LEVELS)[number];

/** The scope actually attached to a stored Assignment. */
export interface AssignmentScope {
  scopeType: ScopeType;
  /** Null only when scopeType === 'platform'. */
  scopeRefId: string | null;
}

/**
 * An Assignment after its Role Profile's permissions have been joined in.
 * This is what a Prisma-backed loader produces for a given user; resolve.ts
 * never touches Prisma directly.
 */
export interface ResolvedAssignment {
  id: string;
  scope: AssignmentScope;
  permissions: ReadonlyArray<readonly [resourceType: string, action: string]>;
}

/**
 * The concrete location of the resource being checked. `parentProgramId`
 * lets a Program-scoped Assignment contain a Project underneath it
 * (RBAC.md §3) — omit/null it for a Project with no parent Program.
 */
export interface ScopeTarget {
  scopeType: ScopeType;
  /** Null only when scopeType === 'platform' (a platform-wide action has no single resource id). */
  scopeRefId: string | null;
  parentProgramId?: string | null;
}

export function permissionKey(resourceType: string, action: string): string {
  return `${resourceType}:${action}`;
}
