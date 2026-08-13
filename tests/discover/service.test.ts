/**
 * C1 §5 (17_ audit). `SECURITY.md` §4's public-read-path filter
 * (`lib/discover/service.ts`'s `PUBLIC_WHERE`) was correctly implemented
 * but had zero test coverage — the one control standing between a
 * non-public record and the anonymous Discover surface, unprotected against
 * a future regression (e.g. someone widening a `where` clause, or adding a
 * new public function that forgets `PUBLIC_WHERE`).
 *
 * Real Postgres (Neon), no mocks, same discipline as every other suite in
 * this codebase. Every fixture is created in beforeAll and torn down in
 * afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  getPublicLocationBySlug,
  getPublicProjectBySlug,
  getPublicStoryBySlug,
  listPublicLocations,
  listPublicProjects,
  listPublicStories,
} from "../../lib/discover/service";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `discover-${Date.now()}`;

let publicLocationId: string;
let internalLocationId: string;
let publicProjectId: string;
let internalProjectId: string;
let pendingReviewPublicProjectId: string; // classification=public, but status not "approved"
let publicStoryOnInternalLocationId: string; // classification=public, but attached to a non-public location

beforeAll(async () => {
  const publicLocation = await prisma.location.create({
    data: {
      name: `TEST Public Location (${RUN_ID})`,
      locationType: "site",
      slug: `test-public-location-${RUN_ID}`,
      status: "approved",
      classification: "public",
    },
  });
  publicLocationId = publicLocation.id;

  const internalLocation = await prisma.location.create({
    data: {
      name: `TEST Internal Location (${RUN_ID})`,
      locationType: "site",
      slug: `test-internal-location-${RUN_ID}`,
      status: "approved",
      classification: "internal",
    },
  });
  internalLocationId = internalLocation.id;

  const publicProject = await prisma.project.create({
    data: {
      name: `TEST Public Project (${RUN_ID})`,
      slug: `test-public-project-${RUN_ID}`,
      status: "approved",
      classification: "public",
    },
  });
  publicProjectId = publicProject.id;

  const internalProject = await prisma.project.create({
    data: {
      name: `TEST Internal Project (${RUN_ID})`,
      slug: `test-internal-project-${RUN_ID}`,
      status: "approved",
      classification: "internal",
    },
  });
  internalProjectId = internalProject.id;

  const pendingReviewPublicProject = await prisma.project.create({
    data: {
      name: `TEST Pending Public Project (${RUN_ID})`,
      slug: `test-pending-public-project-${RUN_ID}`,
      status: "pending_review",
      classification: "public",
    },
  });
  pendingReviewPublicProjectId = pendingReviewPublicProject.id;

  const publicStoryOnInternalLocation = await prisma.story.create({
    data: {
      title: `TEST Public Story on Internal Location (${RUN_ID})`,
      slug: `test-public-story-internal-location-${RUN_ID}`,
      status: "approved",
      classification: "public",
      locationId: internalLocationId,
    },
  });
  publicStoryOnInternalLocationId = publicStoryOnInternalLocation.id;
});

afterAll(async () => {
  await prisma.story.deleteMany({ where: assertDefinedWhere({ id: publicStoryOnInternalLocationId }) });
  await prisma.project.deleteMany({
    where: assertDefinedWhere({ id: { in: [publicProjectId, internalProjectId, pendingReviewPublicProjectId] } }),
  });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [publicLocationId, internalLocationId] } }) });
});

describe("Discover public read path (SECURITY.md §4)", () => {
  it("listPublicProjects includes a public+approved project", async () => {
    const projects = await listPublicProjects();
    expect(projects.some((p) => p.id === publicProjectId)).toBe(true);
  });

  it("listPublicProjects excludes a non-public-classified project even when approved", async () => {
    const projects = await listPublicProjects();
    expect(projects.some((p) => p.id === internalProjectId)).toBe(false);
  });

  it("listPublicProjects excludes a public-classified project that isn't approved yet", async () => {
    const projects = await listPublicProjects();
    expect(projects.some((p) => p.id === pendingReviewPublicProjectId)).toBe(false);
  });

  it("getPublicProjectBySlug returns null (not the record) for a non-public project's slug", async () => {
    const internalProject = await prisma.project.findUniqueOrThrow({ where: { id: internalProjectId } });
    const result = await getPublicProjectBySlug(internalProject.slug!);
    expect(result).toBeNull();
  });

  it("getPublicLocationBySlug's nested story list does not leak a public story attached to a non-public location's own detail page", async () => {
    // This exercises the exact bug shape the audit's own "only path to the
    // data" claim is guarding against: PUBLIC_WHERE is reused for the
    // *nested* `stories`/`products`/`experiences` includes, not just the
    // top-level query — a location that is itself non-public must still
    // never be reachable via getPublicLocationBySlug at all, regardless of
    // what's attached to it.
    const internalLocation = await prisma.location.findUniqueOrThrow({ where: { id: internalLocationId } });
    const result = await getPublicLocationBySlug(internalLocation.slug!);
    expect(result).toBeNull();
  });

  it("listPublicLocations excludes a non-public-classified location", async () => {
    const locations = await listPublicLocations();
    expect(locations.some((l) => l.id === internalLocationId)).toBe(false);
    expect(locations.some((l) => l.id === publicLocationId)).toBe(true);
  });

  it("listPublicStories still includes a public story even when its parent location is not public, but nulls out the location", async () => {
    // The story itself stays the classified unit — a public Story about a
    // non-public place is still shown — but the classification leak this
    // test caught originally (the Location's own record riding along
    // unfiltered on `include: { location: true }`) is now closed: `location`
    // is null instead of exposing an internal-classified record's fields.
    const stories = await listPublicStories();
    const story = stories.find((s) => s.id === publicStoryOnInternalLocationId);
    expect(story).toBeDefined();
    expect(story!.location).toBeNull();
  });

  it("getPublicStoryBySlug nulls out a non-public location instead of exposing it", async () => {
    const story = await prisma.story.findUniqueOrThrow({ where: { id: publicStoryOnInternalLocationId } });
    const result = await getPublicStoryBySlug(story.slug);
    expect(result).not.toBeNull();
    expect(result!.location).toBeNull();
  });
});
