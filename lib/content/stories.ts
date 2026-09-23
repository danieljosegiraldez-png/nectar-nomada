/**
 * The authoring surface for Stories — CLAUDE.md §16, ADR-092.
 *
 * `content:create`, `content:edit`, `content:publish` and `content:view` have
 * existed in the catalog since the RBAC seed and were checked by nothing
 * (ADR-090/091). `/stories` renders approved public stories to visitors, and
 * nothing anywhere wrote one. This is the missing half.
 *
 * Two things are load-bearing here and worth stating before the code:
 *
 * **Publishing is the consequential act, not saving.** `lib/discover/service`
 * selects on `{ status: "approved", classification: "public" }`. So the moment
 * a story becomes world-readable is the moment both of those are true — which
 * makes it a permission of its own (`content:publish`) rather than a flag on
 * an edit form, and makes the classification an explicit choice rather than
 * something inherited quietly from a default.
 *
 * **Editing an approved story is audited rather than versioned.** CLAUDE.md §3
 * requires that approved documents are not silently overwritten and that
 * history stays accessible. A StoryVersion table mirroring ProtocolVersion
 * would be the faithful reading; the decision (ADR-092) was to satisfy §3
 * through the audit trail for now — every edit to an approved story requires
 * `content:publish` and writes an AuditEvent carrying the whole before and
 * after. History is preserved and readable, but only through the audit trail:
 * you cannot browse or restore a previous version, and that limitation is
 * deliberate and recorded, not overlooked.
 */
import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { compareNames } from "../naturalOrder";
import { exigirPersonaPermitida, personasPermitidas } from "../people/quienLoHizo";
import type { ClassificationLevel, RecordStatus } from "../../generated/prisma/client";
import type { ScopeTarget } from "../rbac/types";

export class ContentAccessError extends Error {}
export class ContentValidationError extends Error {}

export type ContentAction = "view" | "create" | "edit" | "publish";

/** What `lib/discover/service.ts` selects on. Named so the two cannot drift apart silently. */
export const PUBLICLY_VISIBLE = { status: "approved" as const, classification: "public" as const };

interface StoryScope {
  projectId?: string | null;
  locationId?: string | null;
}

/**
 * Every scope a story could be reached through, most specific first.
 *
 * A platform-scoped Assignment reaches all of them anyway (RBAC.md §3's
 * containment rule), which is what makes a Content/Ops Coordinator work across
 * projects. The narrower targets matter for a grant scoped to one project.
 */
function scopeTargetsFor(story: StoryScope): ScopeTarget[] {
  const targets: ScopeTarget[] = [];
  if (story.projectId) targets.push({ scopeType: "project", scopeRefId: story.projectId });
  if (story.locationId) targets.push({ scopeType: "location", scopeRefId: story.locationId });
  targets.push({ scopeType: "platform", scopeRefId: null });
  return targets;
}

/**
 * The AND-gate, applied to the story's own classification (ADR-068/081).
 *
 * An `internal` story about a negotiation must not be readable — let alone
 * editable — by someone who clears only `public`, whatever `content:*` they
 * hold.
 */
async function allows(
  userAccountId: string,
  action: ContentAction,
  story: StoryScope,
  classification: ClassificationLevel,
): Promise<boolean> {
  for (const target of scopeTargetsFor(story)) {
    if (await can(userAccountId, action, "content", target, classification)) return true;
  }
  return false;
}

async function requireContent(
  userAccountId: string,
  action: ContentAction,
  story: StoryScope,
  classification: ClassificationLevel,
) {
  if (!(await allows(userAccountId, action, story, classification))) {
    // One message for every refusal: which of the two halves failed is itself
    // information about the story (ADR-081).
    throw new ContentAccessError("no_content_access");
  }
}

/** Stories this account may see, newest first, filtered by permission AND clearance. */
export async function listStoriesForEditor(userAccountId: string) {
  const candidates = await prisma.story.findMany({
    include: { project: true, location: true, authorPerson: true },
    orderBy: { updatedAt: "desc" },
  });

  const visible: typeof candidates = [];
  for (const story of candidates) {
    if (await allows(userAccountId, "view", story, story.classification)) visible.push(story);
  }
  return visible;
}

export async function getStoryForEditor(userAccountId: string, storyId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { project: true, location: true, organization: true, authorPerson: true },
  });
  // A story that cannot be loaded is refused rather than treated as public —
  // a stale id must not become the bypass (ADR-081).
  if (!story) throw new ContentAccessError("no_content_access");
  await requireContent(userAccountId, "view", story, story.classification);

  const [canEdit, canPublish] = await Promise.all([
    allows(userAccountId, "edit", story, story.classification),
    allows(userAccountId, "publish", story, story.classification),
  ]);
  return { story, canEdit, canPublish };
}

/** The choices an author needs, each filtered to what they may actually attach to. */
export async function getAuthoringContext(userAccountId: string) {
  const [projects, locations] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true, classification: true } }),
    prisma.location.findMany({ select: { id: true, name: true, classification: true } }),
  ]);

  const reachableProjects = [];
  for (const p of projects) {
    if (await can(userAccountId, "create", "content", { scopeType: "project", scopeRefId: p.id }, p.classification)) {
      reachableProjects.push({ id: p.id, name: p.name });
    }
  }
  const reachableLocations = [];
  for (const l of locations) {
    if (await can(userAccountId, "create", "content", { scopeType: "location", scopeRefId: l.id }, l.classification)) {
      reachableLocations.push({ id: l.id, name: l.name });
    }
  }

  // El autor, como «quién lo hizo» (decisión P-G, 2026-09-21): hasta ese día esta lista era toda
  // persona activa de la plataforma. Ahora, las de las fincas de lo que se puede adjuntar, más el
  // equipo Néctar Nómada; el servicio exige después la del proyecto o lugar que se elija.
  const { people } = await personasPermitidas(userAccountId, [
    ...reachableProjects.map((p) => ({ projectId: p.id })),
    ...reachableLocations.map((l) => ({ locationId: l.id })),
  ]);

  return {
    projects: reachableProjects.sort((a, b) => compareNames(a.name, b.name)),
    locations: reachableLocations.sort((a, b) => compareNames(a.name, b.name)),
    people,
  };
}

/**
 * A URL-safe slug from a title, with accents folded rather than dropped.
 *
 * "Café de Cerro Azul" must become `cafe-de-cerro-azul`, not `caf-de-cerro-azul`
 * — most titles in this platform carry accents, and stripping the character
 * outright mangles the word (ADR-078's concern, applied to slugs).
 */
export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function uniqueSlug(base: string): Promise<string> {
  const root = base || "story";
  // The unique index is the real guarantee; this only keeps the common case
  // from hitting it. A race still surfaces as P2002 to the caller.
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? root : `${root}-${n + 1}`;
    if (!(await prisma.story.findUnique({ where: { slug: candidate }, select: { id: true } }))) {
      return candidate;
    }
  }
  return `${root}-${Date.now()}`;
}

export interface CreateStoryInput {
  title: string;
  summary?: string | null;
  bodyMarkdown?: string | null;
  projectId?: string | null;
  locationId?: string | null;
  authorPersonId?: string | null;
  classification?: ClassificationLevel;
}

export async function createStory(userAccountId: string, input: CreateStoryInput) {
  const title = input.title.trim();
  if (!title) throw new ContentValidationError("title_required");

  // Defaults to `internal`, matching the column default. A new story is not
  // public until someone decides it is — publishing is a separate act with a
  // separate permission.
  const classification = input.classification ?? "internal";
  const scope = { projectId: input.projectId ?? null, locationId: input.locationId ?? null };
  await requireContent(userAccountId, "create", scope, classification);

  const story = await prisma.$transaction(async (tx) => {
    await exigirPersonaPermitida(userAccountId, input.authorPersonId, [scope], { db: tx });
    const story = await tx.story.create({
      data: {
        title,
        slug: await uniqueSlug(slugify(title)),
        summary: input.summary?.trim() || null,
        bodyMarkdown: input.bodyMarkdown ?? null,
        projectId: scope.projectId,
        locationId: scope.locationId,
        authorPersonId: input.authorPersonId ?? null,
        classification,
        status: "draft",
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "story.create",
        entityType: "story",
        entityId: story.id,
        after: story,
        sourceInterface: "content.stories",
      },
      tx,
    );

    return story;
  });
  return story;
}

export interface UpdateStoryInput {
  title?: string;
  summary?: string | null;
  bodyMarkdown?: string | null;
  projectId?: string | null;
  locationId?: string | null;
  authorPersonId?: string | null;
}

export async function updateStory(userAccountId: string, storyId: string, input: UpdateStoryInput) {
  const before = await prisma.story.findUnique({ where: { id: storyId } });
  if (!before) throw new ContentAccessError("no_content_access");

  await requireContent(userAccountId, "edit", before, before.classification);

  // CLAUDE.md §3 — an approved document is live on the public site, and
  // changing it is closer to publishing than to drafting. Requiring
  // `content:publish` means an editor who may draft cannot silently alter what
  // visitors are already reading.
  if (before.status === "approved") {
    await requireContent(userAccountId, "publish", before, before.classification);
  }

  const title = input.title?.trim();
  if (input.title !== undefined && !title) throw new ContentValidationError("title_required");

  // El proyecto y el lugar con que QUEDA la historia. Mover una historia a otro ámbito exige poder
  // editar también allí (Codex sobre P-G, hallazgo 3): antes sólo se autorizaba el de origen, y
  // cualquiera con permiso en A podía colgar su historia de B.
  const destino = {
    projectId: input.projectId !== undefined ? input.projectId : before.projectId,
    locationId: input.locationId !== undefined ? input.locationId : before.locationId,
  };
  const cambiaDeAmbito = destino.projectId !== before.projectId || destino.locationId !== before.locationId;
  if (cambiaDeAmbito) await requireContent(userAccountId, "edit", destino, before.classification);

  const after = await prisma.$transaction(async (tx) => {
    // Dejar al autor que ya firmaba sólo se exime mientras la historia se queda donde estaba: si
    // cambia de finca, el autor tiene que valer también en la nueva.
    await exigirPersonaPermitida(userAccountId, input.authorPersonId, [destino], {
      db: tx,
      actual: cambiaDeAmbito ? null : before.authorPersonId,
    });
    const after = await tx.story.update({
      where: { id: storyId },
      data: {
        ...(title ? { title } : {}),
        ...(input.summary !== undefined ? { summary: input.summary?.trim() || null } : {}),
        ...(input.bodyMarkdown !== undefined ? { bodyMarkdown: input.bodyMarkdown } : {}),
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
        ...(input.authorPersonId !== undefined ? { authorPersonId: input.authorPersonId } : {}),
      },
    });

    // The whole record either side, not a diff: this is where §3's "historical
    // versions remain accessible" actually lives under ADR-092's decision, so a
    // partial record would make the promise false.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "story.update",
        entityType: "story",
        entityId: storyId,
        before,
        after,
        reason: before.status === "approved" ? "edit_to_published_story" : undefined,
        sourceInterface: "content.stories",
      },
      tx,
    );

    return after;
  });
  return after;
}

/**
 * Move a story between statuses, and set what it may be seen by.
 *
 * Publishing and classification are set together on purpose. They are the two
 * halves of "who can read this", and `lib/discover/service.ts` requires both
 * — a story approved but still `internal` is invisible to visitors, which
 * looks like a broken publish rather than a deliberate state. Asking for both
 * in one act makes the consequence legible at the moment it is chosen.
 */
export async function setStoryStatus(
  userAccountId: string,
  storyId: string,
  status: RecordStatus,
  classification?: ClassificationLevel,
) {
  const before = await prisma.story.findUnique({ where: { id: storyId } });
  if (!before) throw new ContentAccessError("no_content_access");

  const target = classification ?? before.classification;

  // Gated on the story as it is AND as it would become. Otherwise an account
  // that clears `public` but not `internal` could take an internal story and
  // publish it — reading nothing, but exposing everything.
  await requireContent(userAccountId, "publish", before, before.classification);
  if (target !== before.classification) {
    await requireContent(userAccountId, "publish", before, target);
  }

  const after = await prisma.$transaction(async (tx) => {
    const after = await tx.story.update({
      where: { id: storyId },
      data: { status, classification: target },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "story.status_change",
        entityType: "story",
        entityId: storyId,
        before: { status: before.status, classification: before.classification },
        after: { status: after.status, classification: after.classification },
        // The fact worth being able to search the audit log for later.
        reason:
          after.status === PUBLICLY_VISIBLE.status && after.classification === PUBLICLY_VISIBLE.classification
            ? "published_publicly"
            : undefined,
        sourceInterface: "content.stories",
      },
      tx,
    );

    return after;
  });
  return after;
}

/** True when this story is what a visitor to `/stories` would actually see. */
export function isPubliclyVisible(story: { status: RecordStatus; classification: ClassificationLevel }): boolean {
  return story.status === PUBLICLY_VISIBLE.status && story.classification === PUBLICLY_VISIBLE.classification;
}
