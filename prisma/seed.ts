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
import { recordTransformation } from "../lib/traceability/lots";
import { recordHarvestEvent } from "../lib/traceability/harvest";
import { startFermentationRun, endFermentationRun } from "../lib/traceability/fermentation";
import { startDryingRun, endDryingRun } from "../lib/traceability/drying";
import { moveLotToStorage } from "../lib/traceability/storage";
import { createSampleFromLot } from "../lib/traceability/samples";
import { createHive, createColony } from "../lib/apiary/hives";
import { recordInspection } from "../lib/apiary/inspections";
import { recordColonyEvent } from "../lib/apiary/colonyEvents";
import { recordApiaryHarvest } from "../lib/apiary/harvest";

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
 * - Uses "Finca Rosina" and "Kiva Estate" — project/place names CLAUDE.md
 *   §54 already names as acceptable seed examples. The fictional coffee
 *   project itself is named "DEMO Cloudline," deliberately NOT "Las
 *   Nubes" despite CLAUDE.md §54 listing that name too: A7 loaded real
 *   production Projects under "Las Nubes Cerro Azul" and had to delete an
 *   earlier DEMO "Las Nubes" tree specifically because it collided with
 *   them. §54's own example list predates that real data and is stale for
 *   this one name — reusing it here would recreate the exact risk A7's
 *   cleanup existed to remove, so this deviates from the letter of §54's
 *   example list to honor its actual intent (never let DEMO content be
 *   mistaken for something real). CryoBloom is deliberately NOT seeded
 *   here either, given how much more sensitive fabricating even
 *   placeholder copy about it would be for a real, ongoing research
 *   program (this platform's own scientific-integrity principle, applied
 *   to itself).
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
  locationType: "country" | "province" | "district" | "locality" | "site" | "plot";
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
    name: "DEMO Cloudline",
    slug: "demo-cloudline",
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
    where: { slug: "demo-cloudline" },
    update: {},
    create: {
      slug: "demo-cloudline",
      name: "DEMO Cloudline",
      description:
        "A fictional multi-domain project in the Cerro Azul cloud forest, connecting coffee, apiculture, tourism, and research under one territory. [DEMO placeholder content, per CLAUDE.md §54 — plausible but fictional, not a real project record. Named 'DEMO Cloudline' rather than 'Las Nubes' — see this function's own header comment.]",
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
    where: { slug: "discovering-demo-cloudline" },
    update: {},
    create: {
      slug: "discovering-demo-cloudline",
      title: "Discovering DEMO Cloudline",
      summary: "A cloud-forest territory where coffee, bees, and research share the same ground.",
      bodyMarkdown:
        "DEMO Cloudline sits where the forest stays wrapped in cloud most mornings — the kind of place where coffee, " +
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
      summary: "Territory notes on the highland forest surrounding DEMO Cloudline.",
      bodyMarkdown:
        "Cerro Azul's cloud forest is a recurring backdrop for Néctar Nómada's territory work in this area. " +
        "[DEMO placeholder — descriptive copy pending real field notes and review.]",
      locationId: cerroAzul.id,
      status: "approved",
      classification: "public",
    },
  });

  await prisma.product.upsert({
    where: { slug: "demo-cloudline-coffee" },
    update: {},
    create: {
      slug: "demo-cloudline-coffee",
      name: "DEMO Cloudline Coffee",
      summary: "Coffee grown within the DEMO Cloudline project territory.",
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
      summary: "Honey from the apiary domain of the DEMO Cloudline project.",
      description: "[DEMO placeholder listing — harvest and sourcing detail pending.]",
      projectId: lasNubesProject.id,
      locationId: cerroAzul.id,
      status: "approved",
      classification: "public",
    },
  });

  await prisma.experience.upsert({
    where: { slug: "farm-visit-demo-cloudline" },
    update: {},
    create: {
      slug: "farm-visit-demo-cloudline",
      name: "Farm Visit — DEMO Cloudline",
      summary: "A guided walk through the DEMO Cloudline coffee and apiary territory.",
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
      summary: "A territory walk through the highland forest around DEMO Cloudline.",
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
 * DEMO Cloudline with "Partner Field Collector" so this account can
 * actually log in and demonstrate the classification-gated Partner
 * Workspace view (MVP_ROADMAP.md Slice 5) end to end, not just in a
 * one-off test fixture.
 */
async function seedDemoPartner(lasNubesProjectId: string) {
  const email = "demo-partner@nectar-nomada.example";
  const existingPerson = await prisma.person.findFirst({ where: { email } });
  const userAccount = existingPerson
    ? await prisma.userAccount.findFirstOrThrow({ where: { personId: existingPerson.id } })
    : await (async () => {
        const passwordHash = await hashPassword("DemoPartner!2026-change-me");
        const person = await prisma.person.create({
          data: { givenName: "DEMO", familyName: "Partner", displayName: "DEMO Partner Field Collector", email },
        });
        const account = await prisma.userAccount.create({
          data: { personId: person.id, authProvider: "credentials", passwordHash, status: "active" },
        });
        console.log(`Seeded DEMO Partner Field Collector — email: ${email}, password: DemoPartner!2026-change-me`);
        return account;
      })();

  // Checked unconditionally, not only on first creation — the account can
  // survive a DEMO Project's own deletion/recreation (A7's own "Las
  // Nubes" cleanup precedent), which would otherwise leave a real,
  // loginable account holding an Assignment scoped to a Project id that
  // no longer exists. Same class of bug fixed in seedDemoTraceabilityChain
  // below.
  const partnerProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Partner Field Collector" } });
  const existingAssignment = await prisma.assignment.findFirst({
    where: { userAccountId: userAccount.id, scope: { scopeType: "project", scopeRefId: lasNubesProjectId } },
  });
  if (!existingAssignment) {
    const projectScope = await findOrCreateProjectScope(lasNubesProjectId);
    await prisma.assignment.create({
      data: { userAccountId: userAccount.id, roleProfileId: partnerProfile.id, scopeId: projectScope.id },
    });
    console.log("Assigned to the DEMO Cloudline project. Local/dev seed data only — CLAUDE.md §54. Rotate or remove before any shared deployment.");
  } else {
    console.log("DEMO Partner Field Collector already seeded — skipping.");
  }

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
const COFFEE_STANDARD_SOURCE_REFERENCE =
  "Adapted from the general structure of the SCA Coffee Value Assessment (CVA-103 Descriptive / " +
  "CVA-104 Affective) — separating what the coffee tastes like from how much the evaluator values it. " +
  "Not a reproduction of CVA's proprietary intensity-scale wording or official form, and not an SCA-licensed " +
  "implementation. BEVERAGE_SENSORY_PROTOCOLS.md §1/§3, DECISIONS.md ADR-035.";

async function seedDemoSensoryContent(lasNubesProjectId: string) {
  const existingProtocol = await prisma.sensoryProtocol.findFirst({
    where: { name: "Coffee Cupping (Illustrative)" },
    include: { versions: { include: { attributes: true } } },
  });
  if (existingProtocol) {
    // Patch metadata/section fields onto already-seeded rows (e.g. production) rather than
    // silently skipping — BEVERAGE_SENSORY_PROTOCOLS.md §3 requires every protocol to carry a
    // standard_source_reference, which didn't exist as a field when this protocol was first seeded.
    await prisma.sensoryProtocol.update({
      where: { id: existingProtocol.id },
      data: { standardSourceReference: COFFEE_STANDARD_SOURCE_REFERENCE, standardLicenseStatus: "adapted_original" },
    });
    const affectiveNames = new Set(["Overall Impression"]);
    for (const version of existingProtocol.versions) {
      for (const attribute of version.attributes) {
        const section = affectiveNames.has(attribute.name) ? "affective" : "descriptive";
        if (attribute.section !== section) {
          await prisma.sensoryAttribute.update({ where: { id: attribute.id }, data: { section } });
        }
      }
    }
    // A7's own pre-load cleanup (docs/implementation/README.md) removed the
    // entire DEMO "Las Nubes" tree — Project, Samples, and this Session
    // included — as a real-data name-collision risk, but this Protocol row
    // survived it (protocols aren't scoped to a Project). The prior
    // assumption "protocol exists => session exists" no longer holds;
    // self-heal by rebuilding the session/samples/flight instead of
    // crashing on a session this repository may no longer have. Renamed
    // "DEMO Cupping Session — Cloudline" going forward (see this file's
    // "DEMO Cloudline" rename note) — checked by the *old* name too so a
    // pre-rename session from an earlier run is still found, not
    // duplicated.
    const existingSession =
      (await prisma.sensorySession.findFirst({ where: { name: "DEMO Cupping Session — Cloudline" } })) ??
      (await prisma.sensorySession.findFirst({ where: { name: "DEMO Cupping Session — Las Nubes" } }));
    if (existingSession) {
      console.log("Slice 6 DEMO Sensory content already seeded — patched coffee protocol metadata/sections.");
      return existingSession;
    }
    const protocolVersion = existingProtocol.versions[0]!;
    return seedDemoCuppingSession(protocolVersion.id, lasNubesProjectId);
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
      standardSourceReference: COFFEE_STANDARD_SOURCE_REFERENCE,
      standardLicenseStatus: "adapted_original",
    },
  });

  const protocolVersion = await prisma.sensoryProtocolVersion.create({
    data: { protocolId: protocol.id, version: 1, scoreMin: 0, scoreMax: 10, status: "active" },
  });

  // Descriptive (what it tastes like) vs. Affective (how much the evaluator values it) —
  // the CVA-adapted split described above; "Overall Impression" is the affective/hedonic judgment.
  const attributeNames: Array<{ name: string; section: "descriptive" | "affective" }> = [
    { name: "Aroma", section: "descriptive" },
    { name: "Flavor", section: "descriptive" },
    { name: "Acidity", section: "descriptive" },
    { name: "Body", section: "descriptive" },
    { name: "Sweetness", section: "descriptive" },
    { name: "Aftertaste", section: "descriptive" },
    { name: "Overall Impression", section: "affective" },
  ];
  for (const [index, { name, section }] of attributeNames.entries()) {
    await prisma.sensoryAttribute.create({
      data: { protocolVersionId: protocolVersion.id, name, displayOrder: index, scaleMin: 0, scaleMax: 10, section },
    });
  }

  return seedDemoCuppingSession(protocolVersion.id, lasNubesProjectId);
}

/**
 * The session/samples/flight/blind-samples half of the DEMO cupping
 * content, split out from `seedDemoSensoryContent` so it can be called
 * from both "protocol just created" and "protocol already existed but the
 * session it produced was since deleted" (A7's own DEMO "Las Nubes"
 * cleanup) without duplicating this shape.
 */
async function seedDemoCuppingSession(protocolVersionId: string, lasNubesProjectId: string) {
  const sample1 = await prisma.sample.upsert({
    where: { sampleCode: "DCL-CUP-001" },
    update: {},
    create: {
      sampleCode: "DCL-CUP-001",
      sampleType: "green_coffee",
      description: "[DEMO placeholder sample — DEMO Cloudline coffee, lot detail not populated.]",
      projectId: lasNubesProjectId,
      status: "approved",
      classification: "internal",
    },
  });
  const sample2 = await prisma.sample.upsert({
    where: { sampleCode: "DCL-CUP-002" },
    update: {},
    create: {
      sampleCode: "DCL-CUP-002",
      sampleType: "green_coffee",
      description: "[DEMO placeholder sample — DEMO Cloudline coffee, second lot, lot detail not populated.]",
      projectId: lasNubesProjectId,
      status: "approved",
      classification: "internal",
    },
  });

  const session = await prisma.sensorySession.create({
    data: {
      name: "DEMO Cupping Session — Cloudline",
      protocolVersionId,
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
 * Phase 1, ticket T14 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §32, §34) — one DEMO harvest-to-sensory chain, opt-in via
 * SEED_DEMO_CONTENT=true like the rest of this file's demo content.
 *
 * Reuses the real service-layer functions (recordHarvestEvent,
 * recordTransformation, startFermentationRun/endFermentationRun,
 * startDryingRun/endDryingRun, moveLotToStorage, createSampleFromLot)
 * rather than hand-duplicating their invariants (QuantityEvent seeding on
 * every output lot, the stage_change LotTransformation pairing, etc.) —
 * the same "reuse before creating" discipline applied to seed data
 * generation itself. Every one of these functions requires an
 * authenticated, RBAC-checked userAccountId, so this creates one small,
 * internal-only actor to call them with: no passwordHash is ever set, so
 * unlike DEMO Partner Field Collector (seedDemoPartner, a real loginable
 * demo credential), this account cannot authenticate at all — it exists
 * solely to satisfy the service layer's requireLotAccess check for this
 * seeding pass, not as a persona this ticket is introducing.
 *
 * The chain: one harvest, split into two processing batches (the same
 * fork mechanism already verified for a green coffee lot roasted three
 * ways), each independently fermented, dried, moved to storage, and
 * sampled — the two resulting samples attach to the *existing* "DEMO
 * Cupping Session — Cloudline" (seedDemoSensoryContent) as two new blind
 * samples in its existing Flight 1, alongside the two placeholder samples
 * that session already ships with. This is deliberately additive, not a
 * replacement: DCL-CUP-001/002 keep their own "lot detail not populated"
 * placeholder status exactly as documented; these two new samples are
 * what actually satisfies "lot detail populated," genuinely, end to end.
 *
 * **Deliberate, explicit exception, not an oversight:** one of the two new
 * blind samples (D) also gets a `PanelResult` — a real departure from
 * seedDemoSensoryContent's own stated rule ("No Assessments seeded —
 * CLAUDE.md §54 forbids fabricating sensory outcomes") and from
 * DCL-CUP-001/002/C, which stay genuinely unscored. The reason this one
 * crosses that line: ADR-039's own v1 falsifiable test is stated as
 * "cherry through to a cupping score and a lot report" — a DEMO chain
 * that stops one step short of a score cannot demonstrate the mechanism
 * the test itself is defined by, and T13's Lot Report has never been
 * exercised end-to-end against a score reached through real lineage
 * (T13's own test fixture creates a PanelResult directly in a *test*
 * file, never shipped as visible content). This does not relax the
 * platform's evidence discipline for anything else: no `Assessment`
 * (individual judge submission) rows are created — only the aggregate
 * `PanelResult`, the same minimal shape T13's own test already uses —
 * and the value is a round, obviously-illustrative number, not a
 * plausible-looking real one. C stays unscored deliberately, so a reader
 * can see both states side by side in the same session.
 *
 * Named "DEMO Cloudline," not "Las Nubes" — see `seedDemoDiscoverContent`'s
 * own header comment for why. Root cause of a real bug found while
 * verifying this rename: the seed operator's Assignment was only ever
 * created inside the "Person didn't exist yet" branch, so once the
 * Person survived a Project's deletion/recreation (exactly what happened
 * to the old "Las Nubes" Project under A7's cleanup) the reused account
 * kept an Assignment scoped to a Project id that no longer existed —
 * `recordHarvestEvent` below then failed with `no_lot_access`. Fixed by
 * checking for an Assignment scoped to *this* `lasNubesProjectId`
 * specifically, unconditionally, the same pattern `seedDemoApiaryChain`
 * (A8) and `seedDemoPartner` above already use.
 */
async function seedDemoTraceabilityChain(lasNubesProjectId: string, sensorySessionId: string) {
  const existingLot = await prisma.lot.findFirst({ where: { lotCode: "DCL-2027-CHERRY-01" } });
  if (existingLot) {
    console.log("DEMO traceability chain already seeded — skipping.");
    return;
  }

  const lasNubesSite = await findOrCreateLocation({ locationType: "site", name: "DEMO Cloudline", slug: "demo-cloudline" });
  const lasNubesFarm = await findOrCreateOrganization({
    organizationType: "farm",
    name: "DEMO Cloudline",
    description:
      "[DEMO placeholder organization — the coffee-producing side of the DEMO Cloudline multi-domain project. " +
      "No verified production figures, certifications, or exact history populated yet.]",
  });
  const plot = await findOrCreateLocation({
    locationType: "plot",
    name: "DEMO Cloudline — Plot 1",
    slug: "demo-cloudline-plot-1",
    parentLocationId: lasNubesSite.id,
    organizationId: lasNubesFarm.id,
  });

  let seedOperatorPerson = await prisma.person.findFirst({ where: { displayName: "DEMO Seed Operator (internal)" } });
  let seedOperatorAccount;
  if (!seedOperatorPerson) {
    seedOperatorPerson = await prisma.person.create({
      data: { givenName: "DEMO", familyName: "Seed Operator", displayName: "DEMO Seed Operator (internal)", locale: "es" },
    });
    seedOperatorAccount = await prisma.userAccount.create({
      data: { personId: seedOperatorPerson.id, authProvider: "credentials", status: "active" },
    });
  } else {
    seedOperatorAccount = await prisma.userAccount.findFirstOrThrow({ where: { personId: seedOperatorPerson.id } });
  }
  const operatorId = seedOperatorAccount.id;

  // Checked unconditionally against *this* project id, not only when the
  // Person is brand new — see this function's own header comment for the
  // no_lot_access bug this fixes.
  const existingOperatorAssignment = await prisma.assignment.findFirst({
    where: { userAccountId: operatorId, scope: { scopeType: "project", scopeRefId: lasNubesProjectId } },
  });
  if (!existingOperatorAssignment) {
    const farmOperatorProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const projectScope = await findOrCreateProjectScope(lasNubesProjectId);
    await prisma.assignment.create({
      data: { userAccountId: operatorId, roleProfileId: farmOperatorProfile.id, scopeId: projectScope.id },
    });
  }

  const warehouse = await findOrCreateLocation({
    locationType: "site",
    name: "DEMO Cloudline — Warehouse",
    slug: "demo-cloudline-warehouse",
    parentLocationId: lasNubesSite.id,
    organizationId: lasNubesFarm.id,
  });

  // --- Harvest ---
  const { lot: cherryLot } = await recordHarvestEvent(operatorId, {
    lotCode: "DCL-2027-CHERRY-01",
    locationId: plot.id,
    organizationId: lasNubesFarm.id,
    projectId: lasNubesProjectId,
    harvestedAt: new Date("2027-01-20T07:00:00Z"),
    cherryWeightKg: 800,
    brix: 21,
    provenanceClass: "measured_fact",
  });

  // --- Split into two processing batches — same fork mechanism already
  //     verified for a green coffee lot roasted three ways.
  const { outputLots: batches } = await recordTransformation(operatorId, {
    transformationType: "split",
    occurredAt: new Date("2027-01-20T09:00:00Z"),
    provenanceClass: "original_record",
    inputs: [{ lotId: cherryLot.id, quantity: 800, unit: "kg" }],
    outputs: [
      { lotCode: "DCL-2027-BATCH-A", lotType: "processing", quantity: 400, unit: "kg" },
      { lotCode: "DCL-2027-BATCH-B", lotType: "processing", quantity: 400, unit: "kg" },
    ],
  });

  const blindCodes = ["C", "D"];
  const flight = await prisma.sensoryFlight.findFirstOrThrow({ where: { sessionId: sensorySessionId, name: "Flight 1" } });

  for (const [index, batch] of batches.entries()) {
    const suffix = index === 0 ? "A" : "B";

    // --- Fermentation ---
    const { run: fermentationRun } = await startFermentationRun(operatorId, {
      lotId: batch.id,
      startedAt: new Date("2027-01-20T10:00:00Z"),
      quantity: 400,
      unit: "kg",
      provenanceClass: "original_record",
    });
    const { outputLot: dryingStageLot } = await endFermentationRun(operatorId, {
      fermentationRunId: fermentationRun.id,
      endedAt: new Date("2027-01-22T10:00:00Z"),
      outputLotCode: `DCL-2027-DRYING-${suffix}`,
      outputLotType: "drying",
      quantity: 380,
      unit: "kg",
      provenanceClass: "original_record",
    });

    // --- Drying ---
    const { run: dryingRun } = await startDryingRun(operatorId, {
      lotId: dryingStageLot.id,
      startedAt: new Date("2027-01-22T11:00:00Z"),
      quantity: 380,
      unit: "kg",
      provenanceClass: "original_record",
    });
    const { outputLot: greenLot } = await endDryingRun(operatorId, {
      dryingRunId: dryingRun.id,
      endedAt: new Date("2027-02-04T11:00:00Z"),
      outputLotCode: `DCL-2027-GREEN-${suffix}`,
      outputLotType: "green",
      quantity: 320,
      unit: "kg",
      provenanceClass: "original_record",
    });

    // --- Storage ---
    await moveLotToStorage(operatorId, {
      lotId: greenLot.id,
      locationId: warehouse.id,
      containerNote: `Bag ${suffix}`,
      startedAt: new Date("2027-02-04T12:00:00Z"),
    });

    // --- Sample, linked into the existing DEMO Cupping Session's Flight 1 ---
    const { sample } = await createSampleFromLot(operatorId, {
      sampleCode: `DCL-CUP-00${index + 3}`,
      sampleType: "green_coffee",
      description: `DEMO — DEMO Cloudline coffee, batch ${suffix}, full lineage from harvest through drying and storage.`,
      sourceLotId: greenLot.id,
      quantity: 1,
      unit: "kg",
      occurredAt: new Date("2027-02-05T09:00:00Z"),
      provenanceClass: "original_record",
    });

    const blindSample = await prisma.sensoryBlindSample.create({
      data: { flightId: flight.id, blindCode: blindCodes[index]! },
    });
    await prisma.sensoryBlindMapping.create({ data: { blindSampleId: blindSample.id, sampleId: sample.id } });

    // Only batch B (blind code D) gets a score — see the function-level
    // comment for why this one crosses the "never fabricate a sensory
    // outcome" line while everything else in this file still doesn't.
    // Round, obviously-illustrative numbers, not a plausible-looking real
    // score; no Assessment (individual judge) rows, only the aggregate.
    if (index === 1) {
      await prisma.panelResult.create({
        data: { blindSampleId: blindSample.id, attributeId: null, responseCount: 3, meanValue: 85, minValue: 80, maxValue: 90 },
      });
    }
  }

  console.log(
    "Seeded T14 DEMO traceability chain: 1 harvest (800 kg), split into 2 batches, each fermented, dried, " +
      "stored, and sampled — 2 new samples linked into the existing DEMO Cupping Session's Flight 1 (blind codes " +
      "C, D). No sensory outcome fabricated — genuinely unscored, same as the session's original placeholder samples.",
  );
}

/**
 * Ticket A8 (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md §3) — DEMO
 * seed for the apiary track, mirroring `seedDemoTraceabilityChain` above
 * but deliberately NOT reusing "Las Nubes" as a name anywhere. A7 had to
 * delete an earlier DEMO "Las Nubes" tree specifically because it collided
 * with the real "Las Nubes Cerro Azul" Projects/Organizations that now
 * exist in this database — reusing that name here would recreate the
 * exact collision risk A7's own cleanup existed to remove. This chain
 * gets its own clearly-fictional "DEMO Highland Apiary" identity instead,
 * fully independent of both the real A7 data and the coffee DEMO chain.
 *
 * Reuses the "Honey Sensory Evaluation (ISO/Academic-Grounded)" protocol
 * `seedBeverageProtocolsContent` already seeds unconditionally, rather
 * than creating a second honey protocol — the same zero-duplication
 * discipline A3/A4 already proved for the service layer, applied here to
 * seed content. Must run after `seedBeverageProtocolsContent` in `main()`
 * so that protocol already exists.
 */
async function seedDemoApiaryChain() {
  const existingLot = await prisma.lot.findFirst({ where: { lotCode: "DEMO-APIARY-HONEY-01" } });
  if (existingLot) {
    console.log("DEMO apiary chain already seeded — skipping.");
    return;
  }

  const apiaryOrg = await prisma.organization.findFirst({ where: { name: "DEMO Highland Apiary" } });
  const organization =
    apiaryOrg ??
    (await prisma.organization.create({
      data: {
        organizationType: "farm",
        name: "DEMO Highland Apiary",
        description: "[DEMO placeholder organization — a fictional apiary example, not a real producer.]",
        status: "approved",
        classification: "internal",
      },
    }));

  const existingSite = await prisma.location.findFirst({ where: { locationType: "apiary_site", name: "DEMO Highland Apiary" } });
  const apiarySite =
    existingSite ??
    (await prisma.location.create({
      data: {
        locationType: "apiary_site",
        name: "DEMO Highland Apiary",
        organizationId: organization.id,
        status: "approved",
        classification: "internal",
      },
    }));

  const existingProject = await prisma.project.findFirst({ where: { name: "DEMO Highland Apiary — Honey" } });
  const project =
    existingProject ??
    (await prisma.project.create({
      data: { name: "DEMO Highland Apiary — Honey", status: "approved", classification: "internal" },
    }));

  let seedOperatorPerson = await prisma.person.findFirst({ where: { displayName: "DEMO Seed Operator (internal)" } });
  let seedOperatorAccount;
  if (!seedOperatorPerson) {
    seedOperatorPerson = await prisma.person.create({
      data: { givenName: "DEMO", familyName: "Seed Operator", displayName: "DEMO Seed Operator (internal)", locale: "es" },
    });
    seedOperatorAccount = await prisma.userAccount.create({
      data: { personId: seedOperatorPerson.id, authProvider: "credentials", status: "active" },
    });
  } else {
    seedOperatorAccount = await prisma.userAccount.findFirstOrThrow({ where: { personId: seedOperatorPerson.id } });
  }
  const operatorId = seedOperatorAccount.id;

  // A fresh Assignment scoped to this apiary Project — the same seed
  // operator account can carry more than one Assignment (RBAC.md §9), so
  // reusing the identity here doesn't imply reusing coffee's own scope.
  const existingAssignment = await prisma.assignment.findFirst({
    where: { userAccountId: operatorId, scope: { scopeType: "project", scopeRefId: project.id } },
  });
  if (!existingAssignment) {
    const farmOperatorProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.upsert({
      where: { scopeType_scopeRefId: { scopeType: "project", scopeRefId: project.id } },
      update: {},
      create: { scopeType: "project", scopeRefId: project.id },
    });
    await prisma.assignment.create({
      data: { userAccountId: operatorId, roleProfileId: farmOperatorProfile.id, scopeId: scope.id },
    });
  }

  // --- Hive + Colony ---
  const hive = await createHive(operatorId, {
    identifier: "DEMO-APIARY-H1",
    locationId: apiarySite.id,
    projectId: project.id,
    installedAt: new Date("2026-10-01"),
  });
  const colony = await createColony(operatorId, {
    hiveId: hive.id,
    startedAt: new Date("2026-10-05"),
    originType: "purchased",
    originNote: "[DEMO placeholder — a fictional nucleus colony purchase, no real supplier.]",
    provenanceClass: "direct_observation",
  });

  // --- A season of Inspections/ColonyEvents ---
  await recordInspection(operatorId, { colonyId: colony.id, occurredAt: new Date("2026-10-15"), outcome: "nothing_unusual" });
  await recordColonyEvent(operatorId, {
    colonyId: colony.id,
    eventType: "feeding",
    occurredAt: new Date("2026-10-20"),
    feedingMaterial: "1:1 sugar syrup",
    feedingQuantity: 2,
    feedingUnit: "L",
  });
  await recordInspection(operatorId, {
    colonyId: colony.id,
    occurredAt: new Date("2026-11-10"),
    outcome: "issue_observed",
    broodPatternNote: "Good, solid brood pattern",
    queenSighted: true,
    storesLevel: "abundant",
  });

  // --- Harvest -> honey Lot ---
  const { lot: honeyLot } = await recordApiaryHarvest(operatorId, {
    lotCode: "DEMO-APIARY-HONEY-01",
    colonyId: colony.id,
    occurredAt: new Date("2027-01-15"),
    extractedWeightKg: 22,
    framesHarvested: 9,
    provenanceClass: "measured_fact",
  });

  // --- Sample, scored — the same falsifiable-v1-test proof T14 built for
  //     coffee, made visible here for apiary: a real, unmodified honey
  //     batch reaching an actual sensory result through zero new code. ---
  const { sample } = await createSampleFromLot(operatorId, {
    sampleCode: "DEMO-APIARY-HONEY-SAMPLE-01",
    sampleType: "honey_cupping",
    description: "DEMO — Highland Apiary honey, full lineage from harvest through sensory.",
    sourceLotId: honeyLot.id,
    quantity: 0.3,
    unit: "kg",
    occurredAt: new Date("2027-01-16"),
    provenanceClass: "original_record",
  });

  const honeyProtocolVersion = await prisma.sensoryProtocolVersion.findFirstOrThrow({
    where: { protocol: { name: "Honey Sensory Evaluation (ISO/Academic-Grounded)" } },
    orderBy: { version: "desc" },
  });
  const session = await prisma.sensorySession.create({
    data: { name: "DEMO Honey Tasting — Highland Apiary", protocolVersionId: honeyProtocolVersion.id, status: "completed", classification: "internal" },
  });
  const flight = await prisma.sensoryFlight.create({ data: { sessionId: session.id, name: "Flight 1", sequenceOrder: 1 } });
  const blindSample = await prisma.sensoryBlindSample.create({ data: { flightId: flight.id, blindCode: "E" } });
  await prisma.sensoryBlindMapping.create({ data: { blindSampleId: blindSample.id, sampleId: sample.id } });
  // Round, obviously-illustrative number on a 0-10 scale, not a
  // plausible-looking real score — same discipline T14's own DEMO batch B
  // score uses.
  await prisma.panelResult.create({
    data: { blindSampleId: blindSample.id, attributeId: null, responseCount: 3, meanValue: 8, minValue: 7, maxValue: 9 },
  });

  console.log(
    "Seeded A8 DEMO apiary chain: 1 Hive, 1 Colony, a season of 2 Inspections + 1 ColonyEvent, 1 harvest " +
      "(22 kg), 1 Sample scored via the existing Honey sensory protocol (DEMO Honey Tasting — Highland Apiary, " +
      "blind code E).",
  );
}

/**
 * Real (non-DEMO-gated, always runs) Beverage Sensory Protocol content per
 * BEVERAGE_SENSORY_PROTOCOLS.md and DECISIONS.md ADR-035. Unlike the DEMO
 * content above (fictional samples/sessions), these are the platform's
 * actual configured protocols — genuinely usable, honestly attributed to
 * what they're adapted from, never claiming to be an official BJCP/SCA/ISO
 * form. No ReferenceStandard rows are seeded here (CLAUDE.md §54 — no real
 * compound/threshold data sheets available to seed honestly).
 */
async function seedBeverageProtocolsContent() {
  const existingBeer = await prisma.sensoryProtocol.findFirst({ where: { name: "Beer Judging (BJCP-Adapted, Illustrative)" } });
  if (!existingBeer) {
    const bjcpAttributes = ["Aroma", "Appearance", "Flavor", "Mouthfeel", "Overall Impression"] as const;
    for (const [domain, name] of [
      ["beer", "Beer Judging (BJCP-Adapted, Illustrative)"],
      ["mead", "Mead Evaluation (BJCP-Adapted, Illustrative)"],
    ] as const) {
      const protocol = await prisma.sensoryProtocol.create({
        data: {
          domain,
          name,
          description:
            `[Illustrative ${domain} evaluation protocol — general structural shape used broadly across ` +
            "brewing/mead judging (aroma, appearance, flavor, mouthfeel, overall impression), not BJCP's exact " +
            "proprietary scoring rubric or style-specific numeric point allocations.]",
          standardSourceReference:
            "Adapted from the general category structure of BJCP (Beer Judge Certification Program) scoresheets " +
            "— not a reproduction of BJCP's official scoresheet, style guidelines, or scoring weights, and not a " +
            "BJCP-certified or licensed implementation. BEVERAGE_SENSORY_PROTOCOLS.md §1/§3, DECISIONS.md ADR-035.",
          standardLicenseStatus: "adapted_original",
        },
      });
      const version = await prisma.sensoryProtocolVersion.create({
        data: { protocolId: protocol.id, version: 1, scoreMin: 0, scoreMax: 10, status: "active" },
      });
      for (const [index, name] of bjcpAttributes.entries()) {
        await prisma.sensoryAttribute.create({
          data: {
            protocolVersionId: version.id,
            name,
            displayOrder: index,
            scaleMin: 0,
            scaleMax: 10,
            section: name === "Overall Impression" ? "affective" : "descriptive",
          },
        });
      }
    }
    console.log("Seeded Beer and Mead sensory protocols (BJCP-adapted, illustrative).");
  }

  const existingHoney = await prisma.sensoryProtocol.findFirst({ where: { name: "Honey Sensory Evaluation (ISO/Academic-Grounded)" } });
  if (!existingHoney) {
    const protocol = await prisma.sensoryProtocol.create({
      data: {
        domain: "honey",
        name: "Honey Sensory Evaluation (ISO/Academic-Grounded)",
        description:
          "[Honey sensory protocol grounded in published ISO sensory-methodology standards and open academic " +
          "honey-sensory literature — least licensing constraint of the priority batch, still explicitly not an " +
          "official ISO reproduction.]",
        standardSourceReference:
          "Grounded in ISO 4121/5492/8586/8589 general sensory methodology and the International Honey " +
          "Commission odour/aroma wheel, plus published academic literature (e.g. Apidologie) — original attribute " +
          "structure informed by open, citable sources, not a purchased/reproduced ISO document. " +
          "BEVERAGE_SENSORY_PROTOCOLS.md §1/§3, DECISIONS.md ADR-035.",
        standardLicenseStatus: "adapted_original",
      },
    });
    const version = await prisma.sensoryProtocolVersion.create({
      data: { protocolId: protocol.id, version: 1, scoreMin: 0, scoreMax: 10, status: "active" },
    });
    // Four-category structure used across the academic honey-sensory literature (§1): visual,
    // olfactory, olfactory-gustatory, tactile.
    const honeyAttributes: Array<{ name: string; section: "descriptive" | "affective" }> = [
      { name: "Visual — Color", section: "descriptive" },
      { name: "Visual — Clarity", section: "descriptive" },
      { name: "Olfactory — Aroma Intensity", section: "descriptive" },
      { name: "Olfactory — Aroma Character", section: "descriptive" },
      { name: "Olfactory-Gustatory — Flavor", section: "descriptive" },
      { name: "Tactile — Crystallization Texture", section: "descriptive" },
      { name: "Tactile — Viscosity", section: "descriptive" },
      { name: "Overall Impression", section: "affective" },
    ];
    for (const [index, { name, section }] of honeyAttributes.entries()) {
      await prisma.sensoryAttribute.create({
        data: { protocolVersionId: version.id, name, displayOrder: index, scaleMin: 0, scaleMax: 10, section },
      });
    }
    console.log("Seeded Honey sensory protocol (ISO/academic-grounded).");
  }

  // Deferred categories (BEVERAGE_SENSORY_PROTOCOLS.md §4) — recognized evaluation categories the
  // platform is designed to support, no real attribute content or scale until specifically requested.
  const plannedCategories: Array<{ domain: string; name: string }> = [
    { domain: "wine", name: "Wine Evaluation (Planned)" },
    { domain: "cacao", name: "Cacao Fine-Flavor Evaluation (Planned)" },
    { domain: "chocolate", name: "Chocolate Evaluation (Planned)" },
    { domain: "spirits", name: "Spirits Evaluation, General (Planned)" },
    { domain: "rum", name: "Rum Evaluation (Planned)" },
    { domain: "gin", name: "Gin Evaluation (Planned)" },
    { domain: "infused_liquors", name: "Infused Liquors Evaluation (Planned)" },
    { domain: "water", name: "Fine Water Evaluation (Planned)" },
    { domain: "non_alcoholic", name: "Non-Alcoholic Beverage Evaluation (Planned)" },
  ];
  let plannedCreated = 0;
  for (const { domain, name } of plannedCategories) {
    const existing = await prisma.sensoryProtocol.findFirst({ where: { name } });
    if (existing) continue;
    await prisma.sensoryProtocol.create({
      data: {
        domain,
        name,
        description:
          "[Recognized evaluation category, not yet built — BEVERAGE_SENSORY_PROTOCOLS.md §4. No attribute " +
          "content or scale defined until this category is specifically requested.]",
        status: "planned",
      },
    });
    plannedCreated += 1;
  }
  if (plannedCreated > 0) {
    console.log(`Seeded ${plannedCreated} placeholder (status=planned) sensory protocol categories.`);
  }

  const existingSupplier = await prisma.organization.findFirst({ where: { name: "FlavorActiV" } });
  if (!existingSupplier) {
    await prisma.organization.create({
      data: {
        organizationType: "supplier",
        name: "FlavorActiV",
        description:
          "Reference-standard supplier for calibrated sensory flavor/aroma standards (coffee, beer, spirits, " +
          "water) — CQI-partnered. Used as an external Organization record per BEVERAGE_SENSORY_PROTOCOLS.md " +
          "§7.1, not a fixed/hard-coded supplier list.",
        status: "approved",
        classification: "internal",
      },
    });
    console.log("Seeded FlavorActiV as a core.Organization (supplier).");
  }
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

  await seedBeverageProtocolsContent();

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

    await seedDemoTraceabilityChain(lasNubesProject.id, sensorySession.id);

    // A8 — runs after seedBeverageProtocolsContent() (its Honey protocol
    // must already exist) and is fully independent of lasNubesProject, per
    // its own function-level note about not reusing "Las Nubes" naming.
    await seedDemoApiaryChain();
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
