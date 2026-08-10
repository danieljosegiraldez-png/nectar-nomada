/**
 * SECURITY.md §4 — the only path public pages read through. Every query
 * here hard-filters `classification: 'public'` AND `status: 'approved'` by
 * construction; a public route (app/discover/**) must never query
 * Location/Project/Story/Product/Experience directly through `lib/db`.
 * This is unconditional — it does not vary by viewer, including an
 * authenticated admin: the public Discover surface shows the same thing to
 * everyone. Seeing more (drafts, internal-only records) belongs to a future
 * Platform Command Center surface, not this one.
 */
import { prisma } from "../db";

const PUBLIC_WHERE = { classification: "public" as const, status: "approved" as const };

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export function listPublicLocations() {
  return prisma.location.findMany({
    where: { ...PUBLIC_WHERE, slug: { not: null } },
    orderBy: { name: "asc" },
  });
}

export function getPublicLocationBySlug(slug: string) {
  return prisma.location.findFirst({
    where: { ...PUBLIC_WHERE, slug },
    include: {
      organization: true,
      parentLocation: true,
      projectsWithPrimaryLocation: { where: PUBLIC_WHERE, orderBy: { name: "asc" } },
      stories: { where: PUBLIC_WHERE, orderBy: { title: "asc" } },
      products: { where: PUBLIC_WHERE, orderBy: { name: "asc" } },
      experiences: { where: PUBLIC_WHERE, orderBy: { name: "asc" } },
    },
  });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function listPublicProjects() {
  return prisma.project.findMany({
    where: { ...PUBLIC_WHERE, slug: { not: null } },
    include: { primaryLocation: true },
    orderBy: { name: "asc" },
  });
}

export function getPublicProjectBySlug(slug: string) {
  return prisma.project.findFirst({
    where: { ...PUBLIC_WHERE, slug },
    include: {
      primaryLocation: true,
      organization: true,
      program: true,
      domainTags: { include: { domainTag: true } },
      stories: { where: PUBLIC_WHERE, orderBy: { title: "asc" } },
      products: { where: PUBLIC_WHERE, orderBy: { name: "asc" } },
      experiences: { where: PUBLIC_WHERE, orderBy: { name: "asc" } },
    },
  });
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export function listPublicStories() {
  return prisma.story.findMany({
    where: PUBLIC_WHERE,
    include: { project: true, location: true },
    orderBy: { title: "asc" },
  });
}

export function getPublicStoryBySlug(slug: string) {
  return prisma.story.findFirst({
    where: { ...PUBLIC_WHERE, slug },
    include: { project: true, location: true, organization: true, authorPerson: true },
  });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export function listPublicProducts() {
  return prisma.product.findMany({
    where: PUBLIC_WHERE,
    include: { project: true, location: true, organization: true },
    orderBy: { name: "asc" },
  });
}

export function getPublicProductBySlug(slug: string) {
  return prisma.product.findFirst({
    where: { ...PUBLIC_WHERE, slug },
    include: { project: true, location: true, organization: true },
  });
}

// ---------------------------------------------------------------------------
// Experiences
// ---------------------------------------------------------------------------

export function listPublicExperiences() {
  return prisma.experience.findMany({
    where: PUBLIC_WHERE,
    include: { project: true, location: true, organization: true },
    orderBy: { name: "asc" },
  });
}

export function getPublicExperienceBySlug(slug: string) {
  return prisma.experience.findFirst({
    where: { ...PUBLIC_WHERE, slug },
    include: { project: true, location: true, organization: true },
  });
}
