/**
 * The Partner Workspace gates the Project itself, not only its contents —
 * ADR-079.
 *
 * `getPartnerProjects` filtered by permission alone, and `getProjectWorkspace`
 * returned the whole Project record while filtering only its tasks. A partner
 * assigned to an `internal` project could therefore see it listed and open it,
 * reading a description like "Sociedad Huerbsch … posible socio (en
 * negociación)".
 *
 * These tests use the real seeded Partner Field Collector profile — which
 * clears `partner` and nothing above it — rather than a hand-built permission
 * set, so they fail if that profile's clearances ever widen.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { getPartnerProjects, getProjectWorkspace, PartnerAccessError } from "../../lib/partner/workspace";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `pcls-${Date.now()}`;

const created = {
  assignmentIds: [] as string[],
  scopeIds: [] as string[],
  userAccountIds: [] as string[],
  personIds: [] as string[],
  projectIds: [] as string[],
  organizationIds: [] as string[],
};

let partnerAccountId: string;
let adminAccountId: string;
let partnerProjectId: string;
let internalProjectId: string;

async function makeAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "PCLS", familyName: label, displayName: `PCLS ${label} ${RUN}` },
  });
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  created.personIds.push(person.id);
  created.userAccountIds.push(account.id);
  return account.id;
}

async function assign(userAccountId: string, roleName: string, projectId: string) {
  const role = await prisma.roleProfile.findUniqueOrThrow({ where: { name: roleName } });
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "project", scopeRefId: projectId } })) ??
    (await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } }));
  const a = await prisma.assignment.create({
    data: { userAccountId, roleProfileId: role.id, scopeId: scope.id, status: "active" },
  });
  created.assignmentIds.push(a.id);
  created.scopeIds.push(scope.id);
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `PCLS Org ${RUN}`, organizationType: "farm" },
  });
  created.organizationIds.push(org.id);

  const partnerProject = await prisma.project.create({
    data: { name: `PCLS Partner ${RUN}`, organizationId: org.id, classification: "partner", description: "visible to partners" },
  });
  const internalProject = await prisma.project.create({
    // A description of the kind that must not leak: commercial standing.
    data: { name: `PCLS Internal ${RUN}`, organizationId: org.id, classification: "internal", description: "commercially sensitive" },
  });
  partnerProjectId = partnerProject.id;
  internalProjectId = internalProject.id;
  created.projectIds.push(partnerProject.id, internalProject.id);

  partnerAccountId = await makeAccount("Partner");
  adminAccountId = await makeAccount("Admin");

  // Partner Field Collector clears `partner` only — the real profile.
  await assign(partnerAccountId, "Partner Field Collector", partnerProjectId);
  await assign(partnerAccountId, "Partner Field Collector", internalProjectId);
  // Platform Admin clears everything, and holds the partner:* actions.
  await assign(adminAccountId, "Platform Admin", internalProjectId);
});

afterAll(async () => {
  // ADR-045 — never a deleteMany whose where clause could silently become {}.
  const w = (ids: string[]) => assertDefinedWhere({ id: { in: ids } });
  if (created.assignmentIds.length) await prisma.assignment.deleteMany({ where: w(created.assignmentIds) });
  if (created.userAccountIds.length) await prisma.userAccount.deleteMany({ where: w(created.userAccountIds) });
  if (created.personIds.length) await prisma.person.deleteMany({ where: w(created.personIds) });
  if (created.scopeIds.length) await prisma.scope.deleteMany({ where: w(created.scopeIds) });
  if (created.projectIds.length) await prisma.project.deleteMany({ where: w(created.projectIds) });
  if (created.organizationIds.length) await prisma.organization.deleteMany({ where: w(created.organizationIds) });
});

describe("a partner who clears only `partner`", () => {
  it("sees the partner-classified project they are assigned to", async () => {
    const projects = await getPartnerProjects(partnerAccountId);
    expect(projects.map((p) => p.id)).toContain(partnerProjectId);
  });

  it("does NOT see the internal project, though assigned to it", async () => {
    // The assignment and the partner:* permissions are both present — only the
    // clearance is missing, so this is the classification gate and nothing
    // else doing the work.
    const projects = await getPartnerProjects(partnerAccountId);
    expect(projects.map((p) => p.id)).not.toContain(internalProjectId);
  });

  it("cannot open the internal project either", async () => {
    // Hiding it from the list is not enough — the id is guessable and the URL
    // is reachable. SECURITY.md: the frontend is not the boundary.
    await expect(getProjectWorkspace(partnerAccountId, internalProjectId)).rejects.toBeInstanceOf(PartnerAccessError);
  });

  it("cannot read the internal project's description through the workspace", async () => {
    // The description is the actual sensitive payload.
    await expect(getProjectWorkspace(partnerAccountId, internalProjectId)).rejects.toThrow("no_project_access");
  });

  it("can still open the partner-classified project", async () => {
    // The pair matters: if this failed, the gate would be refusing everything
    // rather than refusing by classification.
    const workspace = await getProjectWorkspace(partnerAccountId, partnerProjectId);
    expect(workspace.project.id).toBe(partnerProjectId);
  });
});

describe("an account that clears internal", () => {
  it("sees and can open the internal project", async () => {
    const projects = await getPartnerProjects(adminAccountId);
    expect(projects.map((p) => p.id)).toContain(internalProjectId);

    const workspace = await getProjectWorkspace(adminAccountId, internalProjectId);
    expect(workspace.project.description).toBe("commercially sensitive");
  });
});
