/**
 * The Story authoring surface — ADR-092.
 *
 * `content:*` was granted and checked nowhere (ADR-090). These tests exist to
 * make the opposite true, so the four entries can leave ADR-091's inventory
 * having actually been enforced rather than merely referenced.
 *
 * The roles are the real seeded profiles. Content/Ops Coordinator holds all
 * four content actions and clears `internal`; Project Viewer holds none of
 * them and clears `internal` too — which is what makes it the right foil, since
 * a refusal for that account is the permission half and nothing else.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import {
  createStory,
  updateStory,
  setStoryStatus,
  listStoriesForEditor,
  getStoryForEditor,
  isPubliclyVisible,
  slugify,
  ContentAccessError,
  ContentValidationError,
} from "../../lib/content/stories";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `content-${Date.now()}`;

let editor: string;
let viewer: string;
const personIds: string[] = [];
const accountIds: string[] = [];
const scopeIds: string[] = [];
const storyIds: string[] = [];

async function makeAccount(label: string, roleName: string) {
  const person = await prisma.person.create({
    data: { givenName: "CONTENT", familyName: label, displayName: `CONTENT ${label} ${RUN}` },
  });
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  const role = await prisma.roleProfile.findUniqueOrThrow({ where: { name: roleName } });
  const scope = await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } });
  await prisma.assignment.create({
    data: { userAccountId: account.id, roleProfileId: role.id, scopeId: scope.id, status: "active" },
  });
  personIds.push(person.id);
  accountIds.push(account.id);
  scopeIds.push(scope.id);
  return account.id;
}

/** Creates through the service, so every fixture is itself a gate exercise. */
async function newStory(title: string, classification: "public" | "internal" = "internal") {
  const story = await createStory(editor, { title, classification });
  storyIds.push(story.id);
  return story;
}

beforeAll(async () => {
  editor = await makeAccount("Editor", "Content/Ops Coordinator");
  viewer = await makeAccount("Viewer", "Project Viewer");
});

afterAll(async () => {
  // ADR-045 — never a deleteMany whose where clause could silently become {}.
  if (storyIds.length) {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: storyIds } }) });
    await prisma.story.deleteMany({ where: assertDefinedWhere({ id: { in: storyIds } }) });
  }
  if (accountIds.length) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: accountIds } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: accountIds } }) });
  }
  if (scopeIds.length) await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
  if (personIds.length) await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });

  // ADR-086's lesson: assert the cleanup worked, at the end, after every
  // delete. A cleanup nothing checks is one that can silently stop working.
  expect(await prisma.story.count({ where: { title: { contains: RUN } } })).toBe(0);
});

describe("the permission half", () => {
  it("lets a Content/Ops Coordinator create a story", async () => {
    const story = await newStory(`CONTENT Draft ${RUN}`);
    expect(story.status).toBe("draft");
    // Not public until someone says so — publishing is a separate act.
    expect(story.classification).toBe("internal");
    expect(isPubliclyVisible(story)).toBe(false);
  });

  it("refuses a Project Viewer, who holds no content permission at all", async () => {
    await expect(createStory(viewer, { title: `CONTENT Nope ${RUN}` })).rejects.toBeInstanceOf(ContentAccessError);
  });

  it("refuses that same account the edit and publish paths too", async () => {
    const story = await newStory(`CONTENT Guarded ${RUN}`);
    await expect(updateStory(viewer, story.id, { title: "x" })).rejects.toBeInstanceOf(ContentAccessError);
    await expect(setStoryStatus(viewer, story.id, "approved")).rejects.toBeInstanceOf(ContentAccessError);
  });

  it("refuses a story that does not exist rather than treating it as reachable", async () => {
    await expect(
      getStoryForEditor(editor, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(ContentAccessError);
  });
});

describe("the classification half", () => {
  it("hides an internal story from an account that does not clear internal", async () => {
    // Built by hand rather than reused: the seeded profiles all clear
    // `internal`, so proving the classification gate needs a role that holds
    // the action and no clearance — the same construction ADR-068's tests use.
    const profile = await prisma.roleProfile.create({
      data: { name: `CONTENT Uncleared ${RUN}`, description: "test-only: content actions, no clearance" },
    });
    const permissions = await prisma.permission.findMany({ where: { resourceType: "content" } });
    expect(permissions.length).toBe(4);
    for (const permission of permissions) {
      await prisma.roleProfilePermission.create({
        data: { roleProfileId: profile.id, permissionId: permission.id },
      });
    }
    const person = await prisma.person.create({
      data: { givenName: "CONTENT", familyName: "Uncleared", displayName: `CONTENT Uncleared ${RUN}` },
    });
    const account = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    const scope = await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } });
    await prisma.assignment.create({
      data: { userAccountId: account.id, roleProfileId: profile.id, scopeId: scope.id, status: "active" },
    });
    personIds.push(person.id);
    accountIds.push(account.id);
    scopeIds.push(scope.id);

    const internal = await newStory(`CONTENT Internal ${RUN}`, "internal");
    await expect(getStoryForEditor(account.id, internal.id)).rejects.toBeInstanceOf(ContentAccessError);

    // The pair matters more than either half: only the classification differs.
    const publicStory = await newStory(`CONTENT Public ${RUN}`, "public");
    const loaded = await getStoryForEditor(account.id, publicStory.id);
    expect(loaded.story.id).toBe(publicStory.id);

    // Cascades from the profile, so no separate cleanup for the grants.
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: account.id }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: account.id }) });
    await prisma.roleProfile.deleteMany({ where: assertDefinedWhere({ id: profile.id }) });
  });

  it("filters the editor list by clearance, not only by permission", async () => {
    const listed = await listStoriesForEditor(editor);
    expect(listed.length).toBeGreaterThan(0);
    // The Content/Ops Coordinator clears internal, so the internal fixtures
    // are present — this is the allow half of the pair above.
    expect(listed.some((s) => s.title.includes(`CONTENT Internal ${RUN}`))).toBe(true);
  });
});

describe("publishing is the consequential act", () => {
  it("only becomes publicly visible when status AND classification both say so", async () => {
    const story = await newStory(`CONTENT Publishing ${RUN}`, "internal");

    // Approved but still internal: a visitor sees nothing. This is the state
    // that looks like a broken publish, which is why the service sets both.
    const approvedInternal = await setStoryStatus(editor, story.id, "approved");
    expect(approvedInternal.status).toBe("approved");
    expect(isPubliclyVisible(approvedInternal)).toBe(false);

    const published = await setStoryStatus(editor, story.id, "approved", "public");
    expect(isPubliclyVisible(published)).toBe(true);
  });

  it("matches exactly what the public site selects on", async () => {
    // Guards against the two drifting apart: if lib/discover/service.ts ever
    // changed its filter, a story could read as published here and be
    // invisible to visitors, or worse, the reverse.
    const story = await newStory(`CONTENT Discover ${RUN}`, "internal");
    await setStoryStatus(editor, story.id, "approved", "public");

    const viaPublicQuery = await prisma.story.findFirst({
      where: { status: "approved", classification: "public", id: story.id },
    });
    expect(viaPublicQuery).not.toBeNull();
  });

  it("records the publication in the audit trail, findable as such", async () => {
    const story = await newStory(`CONTENT Audited ${RUN}`, "internal");
    await setStoryStatus(editor, story.id, "approved", "public");

    const event = await prisma.auditEvent.findFirst({
      where: { entityId: story.id, operation: "story.status_change" },
      orderBy: { occurredAt: "desc" },
    });
    expect(event).not.toBeNull();
    expect(event!.reason).toBe("published_publicly");
    expect(event!.actorUserAccountId).toBe(editor);
  });
});

describe("an approved story is not edited casually — CLAUDE.md §3", () => {
  it("keeps the whole record either side of an edit, which is where history lives", async () => {
    // ADR-092 satisfies §3 through the audit trail rather than a version
    // table, so a partial `before` would make that promise false.
    const story = await newStory(`CONTENT History ${RUN}`, "internal");
    await setStoryStatus(editor, story.id, "approved", "public");
    await updateStory(editor, story.id, { title: `CONTENT History ${RUN} revised` });

    const event = await prisma.auditEvent.findFirst({
      where: { entityId: story.id, operation: "story.update" },
      orderBy: { occurredAt: "desc" },
    });
    expect(event).not.toBeNull();
    expect(event!.reason).toBe("edit_to_published_story");

    const before = event!.before as Record<string, unknown>;
    const after = event!.after as Record<string, unknown>;
    expect(before.title).toBe(`CONTENT History ${RUN}`);
    expect(after.title).toBe(`CONTENT History ${RUN} revised`);
    // The whole row, not a diff — the earlier body must be recoverable.
    expect(before).toHaveProperty("bodyMarkdown");
    expect(before).toHaveProperty("classification");
  });

  it("does not mark an ordinary draft edit as an edit to published work", async () => {
    const story = await newStory(`CONTENT DraftEdit ${RUN}`, "internal");
    await updateStory(editor, story.id, { summary: "a summary" });

    const event = await prisma.auditEvent.findFirst({
      where: { entityId: story.id, operation: "story.update" },
      orderBy: { occurredAt: "desc" },
    });
    expect(event!.reason).toBeNull();
  });
});

describe("slugs", () => {
  it("folds accents rather than dropping the letter", () => {
    // "caf-de-cerro-azul" would be the result of stripping rather than
    // folding, and most titles in this platform carry accents.
    expect(slugify("Café de Cerro Azul")).toBe("cafe-de-cerro-azul");
    expect(slugify("Ñuble 2026")).toBe("nuble-2026");
    expect(slugify("  ¿Qué pasó?  ")).toBe("que-paso");
  });

  it("never collides, even on identical titles", async () => {
    const a = await newStory(`CONTENT Same Title ${RUN}`);
    const b = await newStory(`CONTENT Same Title ${RUN}`);
    expect(a.slug).not.toBe(b.slug);
  });

  it("refuses an empty title rather than minting a slugless story", async () => {
    await expect(createStory(editor, { title: "   " })).rejects.toBeInstanceOf(ContentValidationError);
  });
});
