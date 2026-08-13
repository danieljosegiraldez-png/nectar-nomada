/**
 * Shared, side-effect-free seed helpers — split out of seed.ts so they can
 * be imported by tests without triggering seed.ts's own top-level
 * `main()` call (seed.ts runs its full seed as an import-time side
 * effect, so importing it directly from a test would attempt a full
 * production seed run).
 *
 * `findOrCreateOrganization`'s name-match reuse is correct and load-bearing
 * for idempotency (re-running seed.ts must not create duplicate DEMO rows).
 * But that same name-match silently reused the real "Finca Rosina"
 * Organization for fictional DEMO content once A7 promoted it to a real
 * org — the exact same mechanism, `seedDemoDiscoverContent`'s own earlier
 * "Las Nubes" collision, bit twice (see
 * `docs/implementation/README.md`'s 2026-08-13 "Finca Rosina" entry and
 * `docs/implementation/22_APIARY_V1_SCOPING_REPORT.md`'s A7 row for the
 * full account). A same-string rename fixes the one collision found; it
 * does not stop a *future* DEMO name from landing on a *future* real
 * organization's name. The check below makes that structurally loud
 * instead of silent: an existing organization only counts as
 * safely-reusable DEMO content if nothing real is attached to it yet.
 */
import type { PrismaClient } from "../generated/prisma/client";

export class DemoOrganizationCollisionError extends Error {}

async function findRealBackingReason(
  prisma: PrismaClient,
  organizationId: string,
): Promise<string | null> {
  const [membershipCount, ownedProjectCount, clientProjectCount] = await Promise.all([
    prisma.organizationMembership.count({ where: { organizationId } }),
    prisma.project.count({ where: { organizationId } }),
    prisma.project.count({ where: { clientOrganizationId: organizationId } }),
  ]);
  if (membershipCount > 0) {
    return `${membershipCount} real OrganizationMembership row(s)`;
  }
  if (ownedProjectCount > 0) {
    return `${ownedProjectCount} real Project row(s) referencing it as organizationId`;
  }
  if (clientProjectCount > 0) {
    return `${clientProjectCount} real Project row(s) referencing it as clientOrganizationId`;
  }
  return null;
}

/**
 * Reuses an existing Organization by exact name match (idempotency across
 * seed re-runs), unless that existing row already has real backing — a
 * real OrganizationMembership, or a real Project pointing at it — in
 * which case it throws rather than silently attaching more DEMO content
 * to a real organization.
 */
export async function findOrCreateOrganization(
  prisma: PrismaClient,
  data: {
    organizationType: "farm" | "estate";
    name: string;
    description?: string;
  },
) {
  const existing = await prisma.organization.findFirst({ where: { name: data.name } });
  if (existing) {
    const realBackingReason = await findRealBackingReason(prisma, existing.id);
    if (realBackingReason !== null) {
      throw new DemoOrganizationCollisionError(
        `Refusing to reuse Organization "${data.name}" (id ${existing.id}) for DEMO seed content — ` +
          `it has ${realBackingReason}, meaning it's a real organization, not DEMO placeholder data. ` +
          `Pick a different DEMO name instead of colliding with it. See ` +
          `docs/implementation/README.md's 2026-08-13 "Finca Rosina" entry for the incident this guards against.`,
      );
    }
    return existing;
  }
  return prisma.organization.create({ data: { ...data, status: "approved", classification: "public" } });
}
