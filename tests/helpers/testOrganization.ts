/**
 * P0 (docs/implementation/41_P0_MASS_BALANCE.md §7) — `Lot.organizationId` is
 * required now, so every fixture that creates a Lot needs a real owner.
 *
 * Shared rather than repeated per test file: eleven files needed the same
 * three lines, and eleven copies of a fixture is eleven places for cleanup to
 * drift. ADR-085 and ADR-086 are both about test residue that outlived its
 * run, so creation and deletion live together here, keyed on the same RUN_ID
 * the rest of each suite's cleanup already uses.
 */
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "./assertDefinedWhere";

export async function createTestOrganization(runId: string): Promise<string> {
  const organization = await prisma.organization.create({
    data: {
      organizationType: "farm",
      name: `TEST Organization (${runId})`,
      status: "approved",
      classification: "internal",
    },
  });
  return organization.id;
}

/**
 * Call **after** the lots referencing it are deleted — an Organization with
 * surviving Lots will not delete, and a silent failure here is exactly the
 * kind of residue ADR-086 found.
 */
export async function deleteTestOrganizations(runId: string): Promise<void> {
  await prisma.organization.deleteMany({
    where: assertDefinedWhere({ name: { contains: runId } }),
  });
}
