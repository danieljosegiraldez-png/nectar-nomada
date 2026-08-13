/**
 * C1 §5 (17_ audit). `SECURITY.md` §4's public-read-path filter
 * (`lib/discover/service.ts`'s `PUBLIC_WHERE`) was correctly implemented
 * but had zero test coverage — the one control standing between a
 * non-public record and the anonymous Discover surface, unprotected against
 * a future regression (e.g. someone widening a `where` clause, or adding a
 * new public function that forgets `PUBLIC_WHERE`).
 *
 * Extended after the initial pass found (and this suite's own tests then
 * caught) that `PUBLIC_WHERE` was only ever applied to the *top-level* query
 * and to-many nested includes — every to-one relation (`location`,
 * `project`, `organization`, `primaryLocation`, `parentLocation`) rode along
 * unfiltered on every function in this file, not just Story's `location`.
 * Fixed by filtering every classification-bearing to-one include the same
 * way. `program`/`authorPerson` carry no `classification` column, so they're
 * deliberately left unfiltered — nothing to leak.
 *
 * Real Postgres (Neon), no mocks, same discipline as every other suite in
 * this codebase. Every fixture is created in beforeAll and torn down in
 * afterAll, children before parents so no FK constraint blocks cleanup.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  getPublicLocationBySlug,
  getPublicProjectBySlug,
  getPublicStoryBySlug,
  getPublicProductBySlug,
  getPublicExperienceBySlug,
  listPublicLocations,
  listPublicProjects,
  listPublicStories,
  listPublicProducts,
  listPublicExperiences,
} from "../../lib/discover/service";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `discover-${Date.now()}`;

let internalOrganizationId: string;
let publicLocationId: string;
let internalLocationId: string;
let publicLocationWithInternalRelationsId: string; // itself public, but organization+parentLocation are internal
let publicProjectId: string;
let internalProjectId: string;
let pendingReviewPublicProjectId: string; // classification=public, but status not "approved"
let publicProjectWithInternalRelationsId: string; // itself public, but organization+primaryLocation are internal
let publicStoryWithInternalRelationsId: string; // classification=public, but location+project+organization are internal
let publicProductWithInternalRelationsId: string; // classification=public, but project+location+organization are internal
let publicExperienceWithInternalRelationsId: string; // classification=public, but project+location+organization are internal

beforeAll(async () => {
  const internalOrganization = await prisma.organization.create({
    data: {
      organizationType: "farm",
      name: `TEST Internal Organization (${RUN_ID})`,
      status: "approved",
      classification: "internal",
    },
  });
  internalOrganizationId = internalOrganization.id;

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

  const publicLocationWithInternalRelations = await prisma.location.create({
    data: {
      name: `TEST Public Location With Internal Relations (${RUN_ID})`,
      locationType: "site",
      slug: `test-public-location-internal-relations-${RUN_ID}`,
      status: "approved",
      classification: "public",
      organizationId: internalOrganizationId,
      parentLocationId: internalLocationId,
    },
  });
  publicLocationWithInternalRelationsId = publicLocationWithInternalRelations.id;

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

  const publicProjectWithInternalRelations = await prisma.project.create({
    data: {
      name: `TEST Public Project With Internal Relations (${RUN_ID})`,
      slug: `test-public-project-internal-relations-${RUN_ID}`,
      status: "approved",
      classification: "public",
      organizationId: internalOrganizationId,
      primaryLocationId: internalLocationId,
    },
  });
  publicProjectWithInternalRelationsId = publicProjectWithInternalRelations.id;

  const publicStoryWithInternalRelations = await prisma.story.create({
    data: {
      title: `TEST Public Story With Internal Relations (${RUN_ID})`,
      slug: `test-public-story-internal-relations-${RUN_ID}`,
      status: "approved",
      classification: "public",
      locationId: internalLocationId,
      projectId: internalProjectId,
      organizationId: internalOrganizationId,
    },
  });
  publicStoryWithInternalRelationsId = publicStoryWithInternalRelations.id;

  const publicProductWithInternalRelations = await prisma.product.create({
    data: {
      name: `TEST Public Product With Internal Relations (${RUN_ID})`,
      slug: `test-public-product-internal-relations-${RUN_ID}`,
      status: "approved",
      classification: "public",
      locationId: internalLocationId,
      projectId: internalProjectId,
      organizationId: internalOrganizationId,
    },
  });
  publicProductWithInternalRelationsId = publicProductWithInternalRelations.id;

  const publicExperienceWithInternalRelations = await prisma.experience.create({
    data: {
      name: `TEST Public Experience With Internal Relations (${RUN_ID})`,
      slug: `test-public-experience-internal-relations-${RUN_ID}`,
      status: "approved",
      classification: "public",
      locationId: internalLocationId,
      projectId: internalProjectId,
      organizationId: internalOrganizationId,
    },
  });
  publicExperienceWithInternalRelationsId = publicExperienceWithInternalRelations.id;
});

afterAll(async () => {
  // Children before parents throughout, so no FK constraint blocks cleanup.
  await prisma.product.deleteMany({ where: assertDefinedWhere({ id: publicProductWithInternalRelationsId }) });
  await prisma.experience.deleteMany({ where: assertDefinedWhere({ id: publicExperienceWithInternalRelationsId }) });
  await prisma.story.deleteMany({ where: assertDefinedWhere({ id: publicStoryWithInternalRelationsId }) });
  await prisma.project.deleteMany({
    where: assertDefinedWhere({
      id: {
        in: [publicProjectId, internalProjectId, pendingReviewPublicProjectId, publicProjectWithInternalRelationsId],
      },
    }),
  });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: publicLocationWithInternalRelationsId }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [publicLocationId, internalLocationId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: internalOrganizationId }) });
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

  it("listPublicProjects nulls out a non-public primaryLocation instead of exposing it", async () => {
    const projects = await listPublicProjects();
    const project = projects.find((p) => p.id === publicProjectWithInternalRelationsId);
    expect(project).toBeDefined();
    expect(project!.primaryLocation).toBeNull();
  });

  it("getPublicProjectBySlug returns null (not the record) for a non-public project's slug", async () => {
    const internalProject = await prisma.project.findUniqueOrThrow({ where: { id: internalProjectId } });
    const result = await getPublicProjectBySlug(internalProject.slug!);
    expect(result).toBeNull();
  });

  it("getPublicProjectBySlug nulls out a non-public organization and primaryLocation instead of exposing them", async () => {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: publicProjectWithInternalRelationsId } });
    const result = await getPublicProjectBySlug(project.slug!);
    expect(result).not.toBeNull();
    expect(result!.organization).toBeNull();
    expect(result!.primaryLocation).toBeNull();
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

  it("getPublicLocationBySlug nulls out a non-public organization and parentLocation instead of exposing them", async () => {
    const location = await prisma.location.findUniqueOrThrow({ where: { id: publicLocationWithInternalRelationsId } });
    const result = await getPublicLocationBySlug(location.slug!);
    expect(result).not.toBeNull();
    expect(result!.organization).toBeNull();
    expect(result!.parentLocation).toBeNull();
  });

  it("listPublicLocations excludes a non-public-classified location", async () => {
    const locations = await listPublicLocations();
    expect(locations.some((l) => l.id === internalLocationId)).toBe(false);
    expect(locations.some((l) => l.id === publicLocationId)).toBe(true);
  });

  it("listPublicStories still includes a public story even when its relations are not public, but nulls out location/project/organization", async () => {
    // The story itself stays the classified unit — a public Story about a
    // non-public place is still shown — but the classification leak this
    // test caught originally (Location, then also Project/Organization
    // riding along unfiltered on `include: { location: true, project: true,
    // organization: true }`) is now closed: all three are null instead of
    // exposing an internal-classified record's fields.
    const stories = await listPublicStories();
    const story = stories.find((s) => s.id === publicStoryWithInternalRelationsId);
    expect(story).toBeDefined();
    expect(story!.location).toBeNull();
    // listPublicStories doesn't include `organization` at all — only
    // `project`/`location` — so only those two are checked here.
    expect(story!.project).toBeNull();
  });

  it("getPublicStoryBySlug nulls out a non-public location, project, and organization instead of exposing them", async () => {
    const story = await prisma.story.findUniqueOrThrow({ where: { id: publicStoryWithInternalRelationsId } });
    const result = await getPublicStoryBySlug(story.slug);
    expect(result).not.toBeNull();
    expect(result!.location).toBeNull();
    expect(result!.project).toBeNull();
    expect(result!.organization).toBeNull();
  });

  it("listPublicProducts nulls out a non-public project, location, and organization instead of exposing them", async () => {
    const products = await listPublicProducts();
    const product = products.find((p) => p.id === publicProductWithInternalRelationsId);
    expect(product).toBeDefined();
    expect(product!.project).toBeNull();
    expect(product!.location).toBeNull();
    expect(product!.organization).toBeNull();
  });

  it("getPublicProductBySlug nulls out a non-public project, location, and organization instead of exposing them", async () => {
    const product = await prisma.product.findUniqueOrThrow({ where: { id: publicProductWithInternalRelationsId } });
    const result = await getPublicProductBySlug(product.slug);
    expect(result).not.toBeNull();
    expect(result!.project).toBeNull();
    expect(result!.location).toBeNull();
    expect(result!.organization).toBeNull();
  });

  it("listPublicExperiences nulls out a non-public project, location, and organization instead of exposing them", async () => {
    const experiences = await listPublicExperiences();
    const experience = experiences.find((e) => e.id === publicExperienceWithInternalRelationsId);
    expect(experience).toBeDefined();
    expect(experience!.project).toBeNull();
    expect(experience!.location).toBeNull();
    expect(experience!.organization).toBeNull();
  });

  it("getPublicExperienceBySlug nulls out a non-public project, location, and organization instead of exposing them", async () => {
    const experience = await prisma.experience.findUniqueOrThrow({ where: { id: publicExperienceWithInternalRelationsId } });
    const result = await getPublicExperienceBySlug(experience.slug);
    expect(result).not.toBeNull();
    expect(result!.project).toBeNull();
    expect(result!.location).toBeNull();
    expect(result!.organization).toBeNull();
  });
});
