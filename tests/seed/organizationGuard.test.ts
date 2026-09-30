/**
 * Regression coverage for the guard added to
 * `prisma/seedHelpers.ts`'s `findOrCreateOrganization` after the "Finca
 * Rosina" incident (`docs/implementation/README.md`, 2026-08-13 entry):
 * A7 promoted the then-DEMO-only "Finca Rosina" Organization to be the
 * real Cerro Azul farm org, but `seedDemoDiscoverContent()`'s
 * name-matching `findOrCreateOrganization` kept reusing that same row for
 * fictional DEMO content on every `SEED_DEMO_CONTENT=true` run — the same
 * mechanism that already caused the earlier "Las Nubes" collision fixed
 * in A8. Renaming the DEMO name fixes the one collision found; it does
 * not prove a *future* DEMO name can never land on a *future* real
 * organization's name. This suite exercises the actual guard mechanism
 * against real Neon, without running a full seed against production —
 * proof by execution, not by re-reading the renamed string.
 *
 * `prisma/seedHelpers.ts` is a separate module from `prisma/seed.ts`
 * specifically so it can be imported here: `seed.ts` itself calls its
 * `main()` as an import-time side effect (a full production seed run),
 * so importing it directly from a test would attempt exactly that.
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { DemoOrganizationCollisionError, findOrCreateOrganization } from "../../prisma/seedHelpers";

const RUN_ID = `seed-org-guard-${Date.now()}`;

const organizationIdsToClean: string[] = [];
const personIdsToClean: string[] = [];
const projectIdsToClean: string[] = [];
const locationIdsToClean: string[] = [];

afterAll(async () => {
  // Children before parents, so no FK constraint blocks cleanup.
  await prisma.organizationMembership.deleteMany({
    where: assertDefinedWhere({ organizationId: { in: organizationIdsToClean } }),
  });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIdsToClean } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: projectIdsToClean } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIdsToClean } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizationIdsToClean } }) });
});

describe("findOrCreateOrganization DEMO/real collision guard", () => {
  it("throws instead of silently reusing an org that has a real OrganizationMembership", async () => {
    const name = `TEST Real Farm With Membership (${RUN_ID})`;

    const realOrg = await prisma.organization.create({
      data: { organizationType: "farm", name, status: "approved", classification: "public" },
    });
    organizationIdsToClean.push(realOrg.id);

    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: `Owner (${RUN_ID})`, displayName: `TEST Owner (${RUN_ID})` },
    });
    personIdsToClean.push(person.id);

    await prisma.organizationMembership.create({
      data: { personId: person.id, organizationId: realOrg.id, title: "Copropietario" },
    });

    // Simulates a DEMO seed function matching this org by name — exactly
    // what silently happened to the real "Finca Rosina" org.
    await expect(
      findOrCreateOrganization(prisma, {
        organizationType: "farm",
        name,
        description: "[DEMO placeholder — should never attach to a real org.]",
      }),
    ).rejects.toThrow(DemoOrganizationCollisionError);
  });

  it("throws instead of silently reusing an org referenced by a real Project.organizationId", async () => {
    const name = `TEST Real Farm With Project (${RUN_ID})`;

    const realOrg = await prisma.organization.create({
      data: { organizationType: "farm", name, status: "approved", classification: "public" },
    });
    organizationIdsToClean.push(realOrg.id);

    const project = await prisma.project.create({
      data: {
        name: `TEST Real Project (${RUN_ID})`,
        slug: `test-real-project-${RUN_ID}`,
        organizationId: realOrg.id,
        status: "approved",
        classification: "internal",
      },
    });
    projectIdsToClean.push(project.id);

    await expect(
      findOrCreateOrganization(prisma, {
        organizationType: "farm",
        name,
        description: "[DEMO placeholder — should never attach to a real org.]",
      }),
    ).rejects.toThrow(DemoOrganizationCollisionError);
  });

  /**
   * **El caso que faltaba, y que costó descubrirlo: el suelo.** Hasta el 2026-09-30 el guardia
   * contaba membresías y proyectos, no ubicaciones — así que una organización con terreno pasaba
   * por DEMO. Salió al volver real «Kiva Estate», que tiene sus dos fincas y ni una membresía ni
   * un proyecto: el seed la habría reutilizado como contenido ficticio sin que nada lo dijera.
   * Una organización con terreno no es un nombre en una lista.
   */
  it("throws instead of silently reusing an org that has real Locations", async () => {
    const name = `TEST Real Estate With Land (${RUN_ID})`;

    const realOrg = await prisma.organization.create({
      data: { organizationType: "estate", name, status: "approved", classification: "public" },
    });
    organizationIdsToClean.push(realOrg.id);

    const site = await prisma.location.create({
      data: { name: `TEST Finca (${RUN_ID})`, locationType: "site", organizationId: realOrg.id },
    });
    locationIdsToClean.push(site.id);

    await expect(
      findOrCreateOrganization(prisma, {
        organizationType: "estate",
        name,
        description: "[DEMO placeholder — should never attach to a real org.]",
      }),
    ).rejects.toThrow(DemoOrganizationCollisionError);
  });

  it("still reuses idempotently when the matched org has no real backing", async () => {
    const name = `TEST DEMO Farm No Backing (${RUN_ID})`;

    const created = await findOrCreateOrganization(prisma, {
      organizationType: "farm",
      name,
      description: "[DEMO placeholder.]",
    });
    organizationIdsToClean.push(created.id);

    const reused = await findOrCreateOrganization(prisma, {
      organizationType: "farm",
      name,
      description: "[DEMO placeholder.]",
    });

    expect(reused.id).toBe(created.id);
  });

  it("creates a new org when no existing row matches the name", async () => {
    const name = `TEST DEMO Brand New Farm (${RUN_ID})`;

    const before = await prisma.organization.findFirst({ where: { name } });
    expect(before).toBeNull();

    const created = await findOrCreateOrganization(prisma, {
      organizationType: "farm",
      name,
      description: "[DEMO placeholder.]",
    });
    organizationIdsToClean.push(created.id);

    expect(created.name).toBe(name);
  });
});
