/**
 * RBAC.md §5 — seeds the Permission catalog and starter Role Profiles.
 * Idempotent (safe to re-run): everything is an upsert keyed on the same
 * natural keys the schema enforces uniqueness on.
 *
 * The DEMO Platform Admin account (CLAUDE.md §54: seed data must be clearly
 * labeled DEMO, never fabricated real people/credentials) is opt-in via
 * SEED_DEMO_ADMIN=true, specifically so a production `prisma migrate deploy`
 * pipeline never accidentally ships a default login.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PERMISSIONS, ROLE_PROFILES } from "../lib/rbac/catalog";
import { hashPassword } from "../lib/auth/password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function seedPermissions() {
  const byKey = new Map<string, { id: string }>();
  for (const p of PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { resourceType_action: { resourceType: p.resourceType, action: p.action } },
      update: { description: p.description },
      create: { resourceType: p.resourceType, action: p.action, description: p.description },
    });
    byKey.set(`${p.resourceType}:${p.action}`, row);
  }
  return byKey;
}

async function seedRoleProfiles(permissionsByKey: Map<string, { id: string }>) {
  for (const profile of ROLE_PROFILES) {
    const roleProfile = await prisma.roleProfile.upsert({
      where: { name: profile.name },
      update: { description: profile.description },
      create: { name: profile.name, description: profile.description },
    });

    for (const [resourceType, action] of profile.permissions) {
      const permission = permissionsByKey.get(`${resourceType}:${action}`);
      if (!permission) {
        throw new Error(
          `Role Profile "${profile.name}" references undefined permission ${resourceType}:${action}`,
        );
      }
      await prisma.roleProfilePermission.upsert({
        where: {
          roleProfileId_permissionId: { roleProfileId: roleProfile.id, permissionId: permission.id },
        },
        update: {},
        create: { roleProfileId: roleProfile.id, permissionId: permission.id },
      });
    }
  }
}

async function seedPlatformScope() {
  const existing = await prisma.scope.findFirst({ where: { scopeType: "platform" } });
  if (existing) return existing;
  return prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } });
}

async function seedDemoAdmin(platformScopeId: string) {
  const email = "demo-admin@nectar-nomada.example";
  const existingPerson = await prisma.person.findFirst({ where: { email } });
  if (existingPerson) {
    console.log("DEMO Platform Admin already seeded — skipping.");
    return;
  }

  const passwordHash = await hashPassword("DemoAdmin!2026-change-me");

  const person = await prisma.person.create({
    data: {
      givenName: "DEMO",
      familyName: "Admin",
      displayName: "DEMO Platform Admin",
      email,
    },
  });

  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", passwordHash, status: "active" },
  });

  const adminProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });

  await prisma.assignment.create({
    data: { userAccountId: userAccount.id, roleProfileId: adminProfile.id, scopeId: platformScopeId },
  });

  console.log(`Seeded DEMO Platform Admin — email: ${email}, password: DemoAdmin!2026-change-me`);
  console.log("This is local/dev seed data only — CLAUDE.md §54. Rotate or remove before any shared deployment.");
}

/**
 * Slice 2 (Public Discovery) DEMO content — opt-in via SEED_DEMO_CONTENT=true,
 * same reasoning as SEED_DEMO_ADMIN. CLAUDE.md §54 compliance, deliberate:
 *
 * - Uses only project/place names CLAUDE.md §54 already names as acceptable
 *   seed examples (Las Nubes, Finca Rosina, Kiva Estate) — CryoBloom is
 *   deliberately NOT seeded here, given how much more sensitive fabricating
 *   even placeholder copy about it would be for a real, ongoing research
 *   program (this platform's own scientific-integrity principle, applied to
 *   itself).
 * - No GPS/precise coordinates on any seeded Location — CLAUDE.md §54 lists
 *   "GPS" and "addresses" among facts never to fabricate for seed data.
 * - No prices on any seeded Product/Experience — same list, "prices" is
 *   explicit. `priceAmount` stays null; the UI shows "pricing coming soon."
 * - No specific historical dates, certifications, or named people in any
 *   seeded copy or as a Story author — same list. Experience duration is
 *   the one illustrative-but-not-fact-claiming numeric field seeded, since
 *   an approximate visit length is a design parameter, not a claim about
 *   the world.
 */
async function findOrCreateLocation(data: {
  locationType: "country" | "province" | "district" | "locality" | "site";
  name: string;
  slug?: string;
  parentLocationId?: string;
  organizationId?: string;
}) {
  const existing = data.slug
    ? await prisma.location.findUnique({ where: { slug: data.slug } })
    : await prisma.location.findFirst({ where: { locationType: data.locationType, name: data.name, parentLocationId: data.parentLocationId ?? null } });
  if (existing) return existing;
  return prisma.location.create({
    data: { ...data, status: "approved", classification: "public" },
  });
}

async function findOrCreateOrganization(data: {
  organizationType: "farm" | "estate";
  name: string;
  description?: string;
}) {
  const existing = await prisma.organization.findFirst({ where: { name: data.name } });
  if (existing) return existing;
  return prisma.organization.create({ data: { ...data, status: "approved", classification: "public" } });
}

async function findOrCreateProgram(name: string) {
  const existing = await prisma.program.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.program.create({ data: { name, status: "approved" } });
}

async function seedDemoDiscoverContent() {
  // Hierarchy — no GPS on any of these (CLAUDE.md §54).
  const panama = await findOrCreateLocation({ locationType: "country", name: "Panamá" });
  const chiriqui = await findOrCreateLocation({
    locationType: "province",
    name: "Chiriquí",
    parentLocationId: panama.id,
  });
  const panamaProvince = await findOrCreateLocation({
    locationType: "province",
    name: "Panamá",
    parentLocationId: panama.id,
  });
  const boquete = await findOrCreateLocation({
    locationType: "locality",
    name: "Boquete",
    slug: "boquete",
    parentLocationId: chiriqui.id,
  });
  const cerroAzul = await findOrCreateLocation({
    locationType: "locality",
    name: "Cerro Azul",
    slug: "cerro-azul",
    parentLocationId: panamaProvince.id,
  });

  const fincaRosinaOrg = await findOrCreateOrganization({
    organizationType: "farm",
    name: "Finca Rosina",
    description:
      "A specialty coffee farm in the Boquete highlands. [DEMO placeholder — production figures, certifications, and exact history are not populated; add real, verified detail before this leaves demo status.]",
  });
  const kivaEstateOrg = await findOrCreateOrganization({
    organizationType: "estate",
    name: "Kiva Estate",
    description: "[DEMO placeholder organization — no verified details populated yet.]",
  });

  const fincaRosinaSite = await findOrCreateLocation({
    locationType: "site",
    name: "Finca Rosina",
    slug: "finca-rosina",
    parentLocationId: boquete.id,
    organizationId: fincaRosinaOrg.id,
  });
  const lasNubesSite = await findOrCreateLocation({
    locationType: "site",
    name: "Las Nubes",
    slug: "las-nubes",
    parentLocationId: cerroAzul.id,
  });

  const territoryProgram = await findOrCreateProgram("Territory & Terroir Program");

  // A DomainTag catalog row per CLAUDE.md §18's open-ended vocabulary —
  // upserted here rather than only in a dedicated reference-data seed,
  // since nothing else needs these yet.
  const domainTagSlugs = ["coffee", "apiary", "tourism", "research"] as const;
  const domainTagNames: Record<(typeof domainTagSlugs)[number], string> = {
    coffee: "Coffee",
    apiary: "Apiary",
    tourism: "Tourism",
    research: "Research",
  };
  const domainTags = new Map<string, { id: string }>();
  for (const slug of domainTagSlugs) {
    const tag = await prisma.domainTag.upsert({
      where: { slug },
      update: {},
      create: { slug, name: domainTagNames[slug] },
    });
    domainTags.set(slug, tag);
  }

  const lasNubesProject = await prisma.project.upsert({
    where: { slug: "las-nubes" },
    update: {},
    create: {
      slug: "las-nubes",
      name: "Las Nubes",
      description:
        "A multi-domain project in the Cerro Azul cloud forest, connecting coffee, apiculture, tourism, and research under one territory. [DEMO placeholder content, per CLAUDE.md §54 — plausible but fictional, not a real project record.]",
      programId: territoryProgram.id,
      primaryLocationId: lasNubesSite.id,
      status: "approved",
      classification: "public",
    },
  });

  for (const slug of ["coffee", "apiary", "tourism", "research"] as const) {
    const tag = domainTags.get(slug)!;
    await prisma.projectDomainTagAssignment.upsert({
      where: { projectId_domainTagId: { projectId: lasNubesProject.id, domainTagId: tag.id } },
      update: {},
      create: { projectId: lasNubesProject.id, domainTagId: tag.id },
    });
  }

  await prisma.story.upsert({
    where: { slug: "discovering-las-nubes" },
    update: {},
    create: {
      slug: "discovering-las-nubes",
      title: "Discovering Las Nubes",
      summary: "A cloud-forest territory where coffee, bees, and research share the same ground.",
      bodyMarkdown:
        "Las Nubes sits where the forest stays wrapped in cloud most mornings — the kind of place where coffee, " +
        "pollinators, and long-running research questions all depend on the same few hundred meters of elevation. " +
        "This is placeholder demo copy: it exists to validate the Discover architecture end to end, not to describe " +
        "verified project history. Real storytelling content replaces this once written and reviewed.",
      projectId: lasNubesProject.id,
      locationId: lasNubesSite.id,
      status: "approved",
      classification: "public",
    },
  });

  await prisma.story.upsert({
    where: { slug: "cloud-forest-of-cerro-azul" },
    update: {},
    create: {
      slug: "cloud-forest-of-cerro-azul",
      title: "The Cloud Forest of Cerro Azul",
      summary: "Territory notes on the highland forest surrounding Las Nubes.",
      bodyMarkdown:
        "Cerro Azul's cloud forest is a recurring backdrop for Néctar Nómada's territory work in this area. " +
        "[DEMO placeholder — descriptive copy pending real field notes and review.]",
      locationId: cerroAzul.id,
      status: "approved",
      classification: "public",
    },
  });

  await prisma.product.upsert({
    where: { slug: "las-nubes-coffee" },
    update: {},
    create: {
      slug: "las-nubes-coffee",
      name: "Las Nubes Coffee",
      summary: "Coffee grown within the Las Nubes project territory.",
      description: "[DEMO placeholder listing — pricing, lot detail, and processing notes pending Slice 3 (Commerce).]",
      projectId: lasNubesProject.id,
      organizationId: fincaRosinaOrg.id,
      locationId: lasNubesSite.id,
      status: "approved",
      classification: "public",
      // priceAmount intentionally left null — CLAUDE.md §54.
    },
  });

  await prisma.product.upsert({
    where: { slug: "cerro-azul-wildflower-honey" },
    update: {},
    create: {
      slug: "cerro-azul-wildflower-honey",
      name: "Cerro Azul Wildflower Honey",
      summary: "Honey from the apiary domain of the Las Nubes project.",
      description: "[DEMO placeholder listing — harvest and sourcing detail pending.]",
      projectId: lasNubesProject.id,
      locationId: cerroAzul.id,
      status: "approved",
      classification: "public",
    },
  });

  await prisma.experience.upsert({
    where: { slug: "farm-visit-las-nubes" },
    update: {},
    create: {
      slug: "farm-visit-las-nubes",
      name: "Farm Visit — Las Nubes",
      summary: "A guided walk through the Las Nubes coffee and apiary territory.",
      description: "[DEMO placeholder listing — itinerary, capacity, and booking arrive with Slice 4 (Experiences).]",
      durationMinutes: 120,
      projectId: lasNubesProject.id,
      locationId: lasNubesSite.id,
      organizationId: kivaEstateOrg.id,
      status: "approved",
      classification: "public",
    },
  });

  await prisma.experience.upsert({
    where: { slug: "cloud-forest-walk-cerro-azul" },
    update: {},
    create: {
      slug: "cloud-forest-walk-cerro-azul",
      name: "Cloud Forest Walk — Cerro Azul",
      summary: "A territory walk through the highland forest around Las Nubes.",
      description: "[DEMO placeholder listing.]",
      durationMinutes: 90,
      locationId: cerroAzul.id,
      status: "approved",
      classification: "public",
    },
  });

  console.log(
    "Seeded Slice 2 DEMO Discover content: 2 organizations, 5 locations, 1 program, 1 project, 2 stories, " +
      "2 products, 2 experiences. Fictional placeholder data — CLAUDE.md §54. Not real project information.",
  );

  return lasNubesProject;
}

async function findOrCreateProjectScope(projectId: string) {
  const existing = await prisma.scope.findFirst({ where: { scopeType: "project", scopeRefId: projectId } });
  if (existing) return existing;
  return prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
}

/**
 * Slice 5 (Partner Workspace) DEMO partner account — opt-in via
 * SEED_DEMO_PARTNER=true, same reasoning as SEED_DEMO_ADMIN (CLAUDE.md §54:
 * never a default login in a shared/production environment). Assigned to
 * Las Nubes with "Partner Field Collector" so this account can actually log
 * in and demonstrate the classification-gated Partner Workspace view
 * (MVP_ROADMAP.md Slice 5) end to end, not just in a one-off test fixture.
 */
async function seedDemoPartner(lasNubesProjectId: string) {
  const email = "demo-partner@nectar-nomada.example";
  const existingPerson = await prisma.person.findFirst({ where: { email } });
  if (existingPerson) {
    console.log("DEMO Partner Field Collector already seeded — skipping.");
    return prisma.userAccount.findFirstOrThrow({ where: { personId: existingPerson.id } });
  }

  const passwordHash = await hashPassword("DemoPartner!2026-change-me");

  const person = await prisma.person.create({
    data: { givenName: "DEMO", familyName: "Partner", displayName: "DEMO Partner Field Collector", email },
  });

  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", passwordHash, status: "active" },
  });

  const partnerProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Partner Field Collector" } });
  const projectScope = await findOrCreateProjectScope(lasNubesProjectId);

  await prisma.assignment.create({
    data: { userAccountId: userAccount.id, roleProfileId: partnerProfile.id, scopeId: projectScope.id },
  });

  console.log(`Seeded DEMO Partner Field Collector — email: ${email}, password: DemoPartner!2026-change-me`);
  console.log("Assigned to the Las Nubes project. Local/dev seed data only — CLAUDE.md §54. Rotate or remove before any shared deployment.");

  return userAccount;
}

/**
 * Slice 5 DEMO Tasks (mixed classification — MVP_ROADMAP.md's own stated
 * purpose for this slice: "first slice where the classification axis
 * meaningfully restricts a non-admin, non-researcher user's view"), plus a
 * DEMO field submission attributed to the DEMO partner account when one
 * exists (submittedByUserAccountId is a required FK — a submission
 * genuinely needs a real actor, so this step is skipped, not faked, when
 * SEED_DEMO_PARTNER wasn't also requested).
 */
async function seedDemoPartnerWorkspaceContent(lasNubesProjectId: string, submitterUserAccountId: string | null) {
  const existingTask = await prisma.task.findFirst({
    where: { projectId: lasNubesProjectId, title: "Confirm bloom-window observations for the apiary plot" },
  });
  if (existingTask) {
    console.log("Slice 5 DEMO Partner Workspace content already seeded — skipping.");
    return;
  }

  await prisma.task.create({
    data: {
      projectId: lasNubesProjectId,
      title: "Confirm bloom-window observations for the apiary plot",
      description:
        "[DEMO placeholder task, classified 'partner' — visible to any partner assigned to this project. Real task content pending real partner engagement.]",
      status: "open",
      classification: "partner",
    },
  });

  await prisma.task.create({
    data: {
      projectId: lasNubesProjectId,
      title: "Internal: review Q3 research budget allocation",
      description:
        "[DEMO placeholder task, deliberately classified 'internal' — demonstrates that a Partner Field Collector assigned to this same project cannot see this task, per RBAC.md's classification axis.]",
      status: "open",
      classification: "internal",
    },
  });

  if (submitterUserAccountId) {
    await prisma.fieldSubmission.create({
      data: {
        projectId: lasNubesProjectId,
        submittedByUserAccountId: submitterUserAccountId,
        title: "Week 1 site check-in",
        notes:
          "[DEMO placeholder field submission — plausible but fictional content used to validate the Partner Workspace submission flow, not a real field report.]",
        classification: "partner",
      },
    });
  }

  console.log(
    "Seeded Slice 5 DEMO Partner Workspace content: 2 tasks" +
      (submitterUserAccountId ? ", 1 field submission" : "") +
      ". Fictional placeholder data — CLAUDE.md §54.",
  );
}

async function findOrCreateSessionScope(sessionId: string) {
  const existing = await prisma.scope.findFirst({ where: { scopeType: "session", scopeRefId: sessionId } });
  if (existing) return existing;
  return prisma.scope.create({ data: { scopeType: "session", scopeRefId: sessionId } });
}

/**
 * Slice 6 (Sensory) DEMO content — opt-in via SEED_DEMO_CONTENT=true, same
 * gate as other Discover/Partner demo content. Per MVP_ROADMAP.md Slice 6,
 * starts with one configured protocol (coffee cupping) rather than every
 * domain at once. Attribute set is a generic, commonly-used illustrative
 * list — explicitly NOT presented as an official standard (e.g. not the SCA
 * cupping form) per CLAUDE.md §30's caution against assuming one specific
 * scoring system. No Assessment rows are seeded — CLAUDE.md §54 forbids
 * fabricating sensory outcomes, so the DEMO session ships genuinely
 * unscored, exactly like the DEMO Products/Experiences ship unpriced.
 */
async function seedDemoSensoryContent(lasNubesProjectId: string) {
  const existingProtocol = await prisma.sensoryProtocol.findFirst({
    where: { name: "Coffee Cupping (Illustrative)" },
  });
  if (existingProtocol) {
    console.log("Slice 6 DEMO Sensory content already seeded — skipping.");
    return prisma.sensorySession.findFirstOrThrow({ where: { name: "DEMO Cupping Session — Las Nubes" } });
  }

  const protocol = await prisma.sensoryProtocol.create({
    data: {
      domain: "coffee",
      name: "Coffee Cupping (Illustrative)",
      description:
        "[DEMO placeholder protocol — a generic, commonly-used illustrative attribute set for coffee cupping. " +
        "Not an official standard (e.g. not the SCA cupping form) — CLAUDE.md §30 explicitly cautions against " +
        "assuming one specific scoring system. Replace with a real, competition/lab-specific protocol version " +
        "before use.]",
    },
  });

  const protocolVersion = await prisma.sensoryProtocolVersion.create({
    data: { protocolId: protocol.id, version: 1, scoreMin: 0, scoreMax: 10, status: "active" },
  });

  const attributeNames = ["Aroma", "Flavor", "Acidity", "Body", "Sweetness", "Aftertaste", "Overall Impression"];
  for (const [index, name] of attributeNames.entries()) {
    await prisma.sensoryAttribute.create({
      data: { protocolVersionId: protocolVersion.id, name, displayOrder: index, scaleMin: 0, scaleMax: 10 },
    });
  }

  const sample1 = await prisma.sample.upsert({
    where: { sampleCode: "LN-CUP-001" },
    update: {},
    create: {
      sampleCode: "LN-CUP-001",
      sampleType: "green_coffee",
      description: "[DEMO placeholder sample — Las Nubes coffee, lot detail not populated.]",
      projectId: lasNubesProjectId,
      status: "approved",
      classification: "internal",
    },
  });
  const sample2 = await prisma.sample.upsert({
    where: { sampleCode: "LN-CUP-002" },
    update: {},
    create: {
      sampleCode: "LN-CUP-002",
      sampleType: "green_coffee",
      description: "[DEMO placeholder sample — Las Nubes coffee, second lot, lot detail not populated.]",
      projectId: lasNubesProjectId,
      status: "approved",
      classification: "internal",
    },
  });

  const session = await prisma.sensorySession.create({
    data: {
      name: "DEMO Cupping Session — Las Nubes",
      protocolVersionId: protocolVersion.id,
      status: "in_progress",
      classification: "internal",
    },
  });

  const flight = await prisma.sensoryFlight.create({
    data: { sessionId: session.id, name: "Flight 1", sequenceOrder: 1 },
  });

  const blindSampleA = await prisma.sensoryBlindSample.create({ data: { flightId: flight.id, blindCode: "A" } });
  await prisma.sensoryBlindMapping.create({ data: { blindSampleId: blindSampleA.id, sampleId: sample1.id } });

  const blindSampleB = await prisma.sensoryBlindSample.create({ data: { flightId: flight.id, blindCode: "B" } });
  await prisma.sensoryBlindMapping.create({ data: { blindSampleId: blindSampleB.id, sampleId: sample2.id } });

  console.log(
    "Seeded Slice 6 DEMO Sensory content: 1 protocol (v1, 7 attributes), 2 samples, 1 session, 1 flight, " +
      "2 blind samples. No Assessments seeded (CLAUDE.md §54 — never fabricate sensory outcomes).",
  );

  return session;
}

/**
 * DEMO Sensory Judge account — opt-in via SEED_DEMO_JUDGE=true, same
 * SEED_DEMO_ADMIN/SEED_DEMO_PARTNER convention. Scoped to the DEMO cupping
 * session so the blind-mapping restriction (RBAC.md §7) is reproducible by
 * anyone, not just demonstrated once in a single session.
 */
async function seedDemoJudge(sessionId: string) {
  const email = "demo-judge@nectar-nomada.example";
  const existingPerson = await prisma.person.findFirst({ where: { email } });
  if (existingPerson) {
    console.log("DEMO Sensory Judge already seeded — skipping.");
    return prisma.userAccount.findFirstOrThrow({ where: { personId: existingPerson.id } });
  }

  const passwordHash = await hashPassword("DemoJudge!2026-change-me");

  const person = await prisma.person.create({
    data: { givenName: "DEMO", familyName: "Judge", displayName: "DEMO Sensory Judge", email },
  });

  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", passwordHash, status: "active" },
  });

  const judgeProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Sensory Judge" } });
  const sessionScope = await findOrCreateSessionScope(sessionId);

  await prisma.assignment.create({
    data: { userAccountId: userAccount.id, roleProfileId: judgeProfile.id, scopeId: sessionScope.id },
  });

  console.log(`Seeded DEMO Sensory Judge — email: ${email}, password: DemoJudge!2026-change-me`);
  console.log(
    "Assigned to the DEMO cupping session. Local/dev seed data only — CLAUDE.md §54. Rotate or remove before any shared deployment.",
  );

  return userAccount;
}

async function main() {
  const permissionsByKey = await seedPermissions();
  await seedRoleProfiles(permissionsByKey);
  const platformScope = await seedPlatformScope();

  if (process.env.SEED_DEMO_ADMIN === "true") {
    await seedDemoAdmin(platformScope.id);
  }

  if (process.env.SEED_DEMO_CONTENT === "true") {
    const lasNubesProject = await seedDemoDiscoverContent();

    let demoPartnerAccount: { id: string } | null = null;
    if (process.env.SEED_DEMO_PARTNER === "true") {
      demoPartnerAccount = await seedDemoPartner(lasNubesProject.id);
    }

    await seedDemoPartnerWorkspaceContent(lasNubesProject.id, demoPartnerAccount?.id ?? null);

    const sensorySession = await seedDemoSensoryContent(lasNubesProject.id);
    if (process.env.SEED_DEMO_JUDGE === "true") {
      await seedDemoJudge(sensorySession.id);
    }
  }

  console.log(`Seeded ${PERMISSIONS.length} permissions and ${ROLE_PROFILES.length} role profiles.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
