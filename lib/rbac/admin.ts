/**
 * Platform Command Center — Users & Permissions (CLAUDE.md §4, ADR-074).
 *
 * The audited primitives already existed in ./service — `createAssignment` and
 * `revokeAssignment`, both writing an AuditEvent per RBAC.md §8. What did not
 * exist was any way to reach them: no route in the application creates or
 * revokes an Assignment, so a Platform Admin held `platform:manage_users` and
 * `platform:manage_permissions` and could exercise neither. Every role change
 * went through a script or raw SQL.
 *
 * This is the missing surface, not new authority.
 */
import { prisma } from "../db";
import { sortByName } from "../naturalOrder";
import { recordAuditEvent } from "../audit";
import { can, createAssignment, revokeAssignment } from "./service";
import { CLASSIFICATION_NOT_APPLICABLE } from "./resolve";
import type { ScopeType } from "../../generated/prisma/client";

export class UserAdminError extends Error {}

const PLATFORM_TARGET = { scopeType: "platform" as const, scopeRefId: null };

/**
 * Granting or revoking a role *is* managing permissions, so that is the
 * permission required — not `manage_users`, which covers the softer account
 * operations. A capability check against platform scope touches no record, so
 * classification does not apply (ADR-068).
 */
export async function requirePermissionAdmin(userAccountId: string) {
  const allowed = await can(
    userAccountId,
    "manage_permissions",
    "platform",
    PLATFORM_TARGET,
    CLASSIFICATION_NOT_APPLICABLE,
  );
  if (!allowed) throw new UserAdminError("no_permission_admin_access");
}

export async function listPeopleForAdmin() {
  const people = await prisma.person.findMany({
    orderBy: { displayName: "asc" },
    include: {
      userAccount: {
        include: {
          assignments: {
            where: { status: "active" },
            include: { roleProfile: true, scope: true },
          },
        },
      },
    },
  });

  // Scope rows carry a type and a bare uuid. Resolving those to names in two
  // queries keeps the page from showing what /my-nectar used to show — a role
  // "at project (dc256877-…)", which tells the reader nothing (ADR-071's
  // sibling problem).
  const refIds = people
    .flatMap((p) => p.userAccount?.assignments ?? [])
    .map((a) => a.scope.scopeRefId)
    .filter((id): id is string => Boolean(id));

  const [projects, locations] = await Promise.all([
    refIds.length
      ? prisma.project.findMany({ where: { id: { in: refIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    refIds.length
      ? prisma.location.findMany({ where: { id: { in: refIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const nameOf = new Map<string, string>([
    ...projects.map((p) => [p.id, p.name] as const),
    ...locations.map((l) => [l.id, l.name] as const),
  ]);

  return people.map((person) => ({
    id: person.id,
    displayName: person.displayName,
    email: person.email,
    account: person.userAccount
      ? {
          id: person.userAccount.id,
          status: person.userAccount.status,
          canSignIn: person.userAccount.passwordHash !== null && person.userAccount.status === "active",
          lastLoginAt: person.userAccount.lastLoginAt,
        }
      : null,
    assignments: (person.userAccount?.assignments ?? []).map((a) => ({
      id: a.id,
      roleName: a.roleProfile.name,
      scopeType: a.scope.scopeType,
      // Falls back to the id when the referenced record cannot be found, so a
      // dangling scope stays visible rather than rendering blank.
      scopeLabel: a.scope.scopeRefId ? (nameOf.get(a.scope.scopeRefId) ?? a.scope.scopeRefId) : null,
    })),
  }));
}

export async function listRoleProfiles() {
  return prisma.roleProfile.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });
}

export async function listScopeChoices() {
  const [projects, locations] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true } }),
    // A4 (revisión final del plan 2a): un estante de secado o una de sus
    // posiciones no es un ámbito de asignación válido — no se ofrece aquí.
    prisma.location.findMany({
      where: { NOT: [{ locationType: "drying_rack" }, { AND: [{ locationType: "drying_bed" }, { rackSlot: { not: null } }] }] },
      select: { id: true, name: true },
    }),
  ]);
  // Same natural order as /plots (ADR-078) — a scope picker listing
  // "Lote 1, Lote 10, Lote 2" is the same hazard as a page doing it.
  return { projects: sortByName(projects, (p) => p.name), locations: sortByName(locations, (l) => l.name) };
}

export interface GrantRoleInput {
  userAccountId: string;
  roleProfileId: string;
  scopeType: ScopeType;
  scopeRefId: string | null;
}

export async function grantRole(actorUserAccountId: string, input: GrantRoleInput) {
  await requirePermissionAdmin(actorUserAccountId);

  if (input.scopeType !== "platform" && !input.scopeRefId) {
    throw new UserAdminError("scope_target_required");
  }
  // A platform-scoped Assignment must point at nothing. Allowing a stray ref
  // here would create a second, subtly different platform scope that
  // `resolvePermissions` would not match the way the caller expects.
  const scopeRefId = input.scopeType === "platform" ? null : input.scopeRefId;

  // Reuse an existing Scope rather than minting a duplicate: two rows for the
  // same (type, ref) silently split grants across them, so a permission check
  // resolving against one would miss an Assignment attached to the other.
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: input.scopeType, scopeRefId } })) ??
    (await prisma.scope.create({ data: { scopeType: input.scopeType, scopeRefId } }));

  const existing = await prisma.assignment.findFirst({
    where: {
      userAccountId: input.userAccountId,
      roleProfileId: input.roleProfileId,
      scopeId: scope.id,
      status: "active",
    },
  });
  if (existing) throw new UserAdminError("already_granted");

  return createAssignment(
    { userAccountId: input.userAccountId, roleProfileId: input.roleProfileId, scopeId: scope.id },
    actorUserAccountId,
  );
}

/**
 * The decision, separated from the query that feeds it.
 *
 * Whether this is the last Platform Admin is global state — every other
 * platform-scoped grant in the database counts — so an integration test cannot
 * reach the zero-remaining case without revoking the real administrator it is
 * running as. Extracting the predicate makes the rule exhaustively testable
 * while `revokeRole` keeps doing the counting.
 */
export function wouldRemoveLastPlatformAdmin(
  roleName: string,
  scopeType: ScopeType,
  remainingActivePlatformAdmins: number,
): boolean {
  return roleName === "Platform Admin" && scopeType === "platform" && remainingActivePlatformAdmins === 0;
}

/**
 * Refuses to revoke the last active platform-scoped Platform Admin.
 *
 * This is the deadlock ADR-067 had to escape from outside the application:
 * granting Platform Admin requires `rbac:manage_permissions`, which only
 * Platform Admin holds, so with no holder the role can never be granted from
 * inside again. Now that revoking is possible through the UI, walking into
 * that state takes two clicks — including by revoking your own.
 */
export async function revokeRole(actorUserAccountId: string, assignmentId: string, reason?: string) {
  await requirePermissionAdmin(actorUserAccountId);

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { roleProfile: true, scope: true },
  });
  if (!assignment) throw new UserAdminError("assignment_not_found");
  if (assignment.status !== "active") throw new UserAdminError("already_revoked");

  const remaining = await prisma.assignment.count({
    where: {
      status: "active",
      roleProfileId: assignment.roleProfileId,
      scope: { scopeType: "platform" },
      NOT: { id: assignmentId },
    },
  });
  if (wouldRemoveLastPlatformAdmin(assignment.roleProfile.name, assignment.scope.scopeType, remaining)) {
    throw new UserAdminError("would_remove_last_platform_admin");
  }

  return revokeAssignment(assignmentId, actorUserAccountId, reason);
}

/**
 * Los permisos EFECTIVOS de una asignación, cada uno diciendo DE DÓNDE VIENE.
 *
 * **La fuente es la mitad útil.** Una lista de permisos sin decir cuál trae el
 * perfil y cuál se añadió a mano obliga a adivinar qué pasa si alguien cambia el
 * perfil — y adivinar sobre autorización es como se abren agujeros. Aquí cada
 * fila dice `perfil`, `añadido` o `quitado`, y los quitados se enseñan TACHADOS
 * en vez de desaparecer: que un permiso falte porque alguien lo quitó a propósito
 * es información, no ausencia.
 */
export async function listAssignmentPermissions(actorUserAccountId: string, assignmentId: string) {
  await requirePermissionAdmin(actorUserAccountId);

  const asignacion = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      roleProfile: { include: { permissions: { include: { permission: true } } } },
      scope: true,
      overrides: { include: { permission: true } },
      userAccount: { include: { person: true } },
    },
  });
  if (!asignacion) throw new UserAdminError("assignment_not_found");

  const porClave = new Map<string, {
    permissionId: string; resourceType: string; action: string;
    origen: "perfil" | "añadido" | "quitado"; reason: string | null;
    /// El id del AJUSTE, no el del permiso. Sin él la pantalla no puede deshacer
    /// un «quitado»: `clearPermissionOverride` borra un ajuste concreto, y pasarle
    /// un `permissionId` habría fallado siempre. Nulo cuando el permiso viene del
    /// perfil y no hay ajuste que deshacer.
    overrideId: string | null;
  }>();
  for (const rp of asignacion.roleProfile.permissions) {
    porClave.set(`${rp.permission.resourceType}:${rp.permission.action}`, {
      permissionId: rp.permission.id, resourceType: rp.permission.resourceType,
      action: rp.permission.action, origen: "perfil", reason: null, overrideId: null,
    });
  }
  for (const o of asignacion.overrides) {
    porClave.set(`${o.permission.resourceType}:${o.permission.action}`, {
      permissionId: o.permission.id, resourceType: o.permission.resourceType,
      action: o.permission.action, origen: o.effect === "deny" ? "quitado" : "añadido",
      reason: o.reason, overrideId: o.id,
    });
  }

  // Y los que NINGUNA de las dos cosas concede, para poder añadirlos sin salir de
  // la pantalla. Sin esto habría que saberse el catálogo de memoria.
  const todos = await prisma.permission.findMany({ orderBy: [{ resourceType: "asc" }, { action: "asc" }] });
  const disponibles = todos.filter((t) => !porClave.has(`${t.resourceType}:${t.action}`));

  return {
    asignacion: {
      id: asignacion.id,
      persona: asignacion.userAccount.person?.displayName ?? "—",
      perfil: asignacion.roleProfile.name,
      scopeType: asignacion.scope.scopeType,
      scopeRefId: asignacion.scope.scopeRefId,
    },
    permisos: [...porClave.values()].sort((a, b) =>
      a.resourceType.localeCompare(b.resourceType) || a.action.localeCompare(b.action)),
    disponibles,
  };
}

export interface SetOverrideInput {
  assignmentId: string;
  permissionId: string;
  effect: "deny" | "grant";
  reason?: string | null;
}

/**
 * Quita o añade un permiso sobre UNA asignación.
 *
 * **La razón es obligatoria para `grant` y se comprueba aquí Y en la base.** No es
 * duplicación por descuido: el CHECK de la migración cubre al importador y al SQL
 * directo, y esta comprobación le da a la pantalla un error que se puede leer en
 * vez de un fallo de restricción.
 */
export async function setPermissionOverride(actorUserAccountId: string, input: SetOverrideInput) {
  await requirePermissionAdmin(actorUserAccountId);

  const razon = input.reason?.trim() || null;
  if (input.effect === "grant" && !razon) throw new UserAdminError("grant_requires_reason");

  const asignacion = await prisma.assignment.findUnique({ where: { id: input.assignmentId }, select: { id: true } });
  if (!asignacion) throw new UserAdminError("assignment_not_found");
  const permiso = await prisma.permission.findUnique({ where: { id: input.permissionId }, select: { id: true } });
  if (!permiso) throw new UserAdminError("permission_not_found");

  return prisma.$transaction(async (tx) => {
    const fila = await tx.assignmentPermissionOverride.upsert({
      where: { assignmentId_permissionId: { assignmentId: input.assignmentId, permissionId: input.permissionId } },
      create: { assignmentId: input.assignmentId, permissionId: input.permissionId, effect: input.effect, reason: razon, createdBy: actorUserAccountId },
      update: { effect: input.effect, reason: razon, createdBy: actorUserAccountId },
    });
    await recordAuditEvent({
      actorUserAccountId,
      operation: "assignment_permission_override.set",
      entityType: "assignment_permission_override",
      entityId: fila.id,
      after: fila,
      reason: razon ?? undefined,
      sourceInterface: "rbac.admin",
    }, tx);
    return fila;
  });
}

/** Devuelve la asignación a lo que su perfil diga, sin más. */
export async function clearPermissionOverride(actorUserAccountId: string, overrideId: string) {
  await requirePermissionAdmin(actorUserAccountId);
  const fila = await prisma.assignmentPermissionOverride.findUnique({ where: { id: overrideId } });
  if (!fila) throw new UserAdminError("override_not_found");

  return prisma.$transaction(async (tx) => {
    await tx.assignmentPermissionOverride.delete({ where: { id: overrideId } });
    await recordAuditEvent({
      actorUserAccountId,
      operation: "assignment_permission_override.clear",
      entityType: "assignment_permission_override",
      entityId: overrideId,
      before: fila,
      sourceInterface: "rbac.admin",
    }, tx);
    return fila;
  });
}
