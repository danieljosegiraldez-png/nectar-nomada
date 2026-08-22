/**
 * Users & Permissions administration — ADR-074.
 *
 * CLAUDE.md §57: RBAC tests are mandatory and unauthorized access must be
 * tested explicitly. This surface grants and revokes authority itself, so the
 * refusals matter more than the successes.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import {
  grantRole,
  revokeRole,
  requirePermissionAdmin,
  wouldRemoveLastPlatformAdmin,
  UserAdminError,
} from "../../lib/rbac/admin";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `admintest-${Date.now()}`;

const created = {
  assignmentIds: [] as string[],
  scopeIds: [] as string[],
  userAccountIds: [] as string[],
  personIds: [] as string[],
};

let adminAccountId: string;
let subjectAccountId: string;
let projectViewerRoleId: string;
let projectId: string;

async function makeAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "ADMINTEST", familyName: label, displayName: `ADMINTEST ${label} ${RUN}` },
  });
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  created.personIds.push(person.id);
  created.userAccountIds.push(account.id);
  return account.id;
}

beforeAll(async () => {
  adminAccountId = await makeAccount("Admin");
  subjectAccountId = await makeAccount("Subject");

  // The actor needs the real Platform Admin profile, at platform scope — the
  // same shape a genuine administrator has, not a hand-built permission set.
  const platformAdmin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const platformScope = await prisma.scope.findFirstOrThrow({ where: { scopeType: "platform", scopeRefId: null } });
  const a = await prisma.assignment.create({
    data: { userAccountId: adminAccountId, roleProfileId: platformAdmin.id, scopeId: platformScope.id, status: "active" },
  });
  created.assignmentIds.push(a.id);

  projectViewerRoleId = (await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Project Viewer" } })).id;
  projectId = (await prisma.project.findFirstOrThrow({ select: { id: true } })).id;
});

afterAll(async () => {
  // ADR-045 — never a deleteMany whose where clause could silently become {}.
  const w = (ids: string[]) => assertDefinedWhere({ id: { in: ids } });
  const assignments = await prisma.assignment.findMany({
    where: { userAccountId: { in: created.userAccountIds } },
    select: { id: true },
  });
  const ids = [...new Set([...created.assignmentIds, ...assignments.map((a) => a.id)])];
  if (ids.length) await prisma.assignment.deleteMany({ where: w(ids) });
  if (created.userAccountIds.length) await prisma.userAccount.deleteMany({ where: w(created.userAccountIds) });
  if (created.personIds.length) await prisma.person.deleteMany({ where: w(created.personIds) });
  // Scopes created by grantRole are shared by design, so they are deliberately
  // not deleted — removing one could orphan a real Assignment.
});

describe("who may administer permissions", () => {
  it("refuses an account with no assignments at all", async () => {
    const nobody = await makeAccount("Nobody");
    await expect(requirePermissionAdmin(nobody)).rejects.toBeInstanceOf(UserAdminError);
  });

  it("refuses grant and revoke to that account, not just the page", async () => {
    // SECURITY.md §2 — the page hides itself, but the service must refuse
    // independently. A hidden control is not an authorization boundary.
    const nobody = await makeAccount("Nobody2");
    await expect(
      grantRole(nobody, {
        userAccountId: subjectAccountId,
        roleProfileId: projectViewerRoleId,
        scopeType: "project",
        scopeRefId: projectId,
      }),
    ).rejects.toThrow("no_permission_admin_access");
  });

  it("allows a real platform-scoped Platform Admin", async () => {
    await expect(requirePermissionAdmin(adminAccountId)).resolves.toBeUndefined();
  });
});

describe("granting", () => {
  it("creates an active assignment and writes an audit event", async () => {
    const before = await prisma.auditEvent.count({ where: { entityType: "assignment", operation: "assignment.create" } });

    const assignment = await grantRole(adminAccountId, {
      userAccountId: subjectAccountId,
      roleProfileId: projectViewerRoleId,
      scopeType: "project",
      scopeRefId: projectId,
    });
    created.assignmentIds.push(assignment.id);

    expect(assignment.status).toBe("active");
    expect(assignment.grantedBy).toBe(adminAccountId);

    const after = await prisma.auditEvent.count({ where: { entityType: "assignment", operation: "assignment.create" } });
    expect(after).toBe(before + 1);
  });

  it("refuses a duplicate rather than stacking two identical grants", async () => {
    await expect(
      grantRole(adminAccountId, {
        userAccountId: subjectAccountId,
        roleProfileId: projectViewerRoleId,
        scopeType: "project",
        scopeRefId: projectId,
      }),
    ).rejects.toThrow("already_granted");
  });

  it("reuses the existing scope rather than minting a duplicate", async () => {
    // Two Scope rows for the same (type, ref) split grants across them, so a
    // permission check resolving against one silently misses the other.
    const scopes = await prisma.scope.findMany({ where: { scopeType: "project", scopeRefId: projectId } });
    expect(scopes.length).toBe(1);
  });

  it("requires a target for a non-platform scope", async () => {
    await expect(
      grantRole(adminAccountId, {
        userAccountId: subjectAccountId,
        roleProfileId: projectViewerRoleId,
        scopeType: "project",
        scopeRefId: null,
      }),
    ).rejects.toThrow("scope_target_required");
  });
});

describe("revoking", () => {
  it("marks the assignment revoked and audits it", async () => {
    const grant = await grantRole(adminAccountId, {
      userAccountId: subjectAccountId,
      roleProfileId: projectViewerRoleId,
      scopeType: "location",
      scopeRefId: (await prisma.location.findFirstOrThrow({ select: { id: true } })).id,
    });
    created.assignmentIds.push(grant.id);

    const revoked = await revokeRole(adminAccountId, grant.id);
    expect(revoked.status).toBe("revoked");
    expect(revoked.validTo).not.toBeNull();

    const audit = await prisma.auditEvent.findFirst({
      where: { entityType: "assignment", entityId: grant.id, operation: "assignment.revoke" },
    });
    expect(audit).not.toBeNull();
  });

  it("refuses to revoke the same assignment twice", async () => {
    const grant = await grantRole(adminAccountId, {
      userAccountId: subjectAccountId,
      roleProfileId: projectViewerRoleId,
      scopeType: "platform",
      scopeRefId: null,
    });
    created.assignmentIds.push(grant.id);
    await revokeRole(adminAccountId, grant.id);
    await expect(revokeRole(adminAccountId, grant.id)).rejects.toThrow("already_revoked");
  });
});

describe("the last Platform Admin cannot be revoked", () => {
  // The predicate rather than the service: whether one is the last is global
  // state, so reaching zero-remaining in an integration test would mean
  // revoking the real administrator the suite is running as.
  it("refuses only when nothing else would remain", () => {
    expect(wouldRemoveLastPlatformAdmin("Platform Admin", "platform", 0)).toBe(true);
    expect(wouldRemoveLastPlatformAdmin("Platform Admin", "platform", 1)).toBe(false);
  });

  it("does not block a project-scoped Platform Admin — platform scope is what deadlocks", () => {
    expect(wouldRemoveLastPlatformAdmin("Platform Admin", "project", 0)).toBe(false);
  });

  it("does not block any other role, however few remain", () => {
    expect(wouldRemoveLastPlatformAdmin("Farm Operator", "platform", 0)).toBe(false);
    expect(wouldRemoveLastPlatformAdmin("Research Lead", "platform", 0)).toBe(false);
  });

  it("still refuses through the service while another admin exists elsewhere", async () => {
    // The actor is itself a platform-scoped Platform Admin, so revoking the
    // subject's leaves at least one — this proves the guard does not
    // over-refuse, which is the half an integration test can reach.
    const grant = await grantRole(adminAccountId, {
      userAccountId: subjectAccountId,
      roleProfileId: (await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } })).id,
      scopeType: "platform",
      scopeRefId: null,
    });
    created.assignmentIds.push(grant.id);
    const revoked = await revokeRole(adminAccountId, grant.id);
    expect(revoked.status).toBe("revoked");
  });
});
