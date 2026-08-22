/**
 * The classification AND-gate, at the service layer — ADR-068.
 *
 * tests/rbac/resolve.test.ts already proves `can()` honours classification
 * over an in-memory assignment set. What it cannot prove is that a service
 * actually *passes the record's* classification rather than a constant, which
 * is the exact defect ADR-062 found: the gate was correct and applied nowhere.
 *
 * So these tests go through the real service functions against the database,
 * with a role deliberately built to hold the action permission and no
 * clearance. If a service ever reverts to passing a constant, the "internal is
 * refused" cases start passing when they should fail.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { updateLocationAttributes, LocationAccessError } from "../../lib/traceability/locations";
import { createSpecimen, SpecimenAccessError } from "../../lib/traceability/specimens";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `clsgate-${Date.now()}`;

const created = {
  assignmentIds: [] as string[],
  scopeIds: [] as string[],
  roleProfileIds: [] as string[],
  userAccountIds: [] as string[],
  personIds: [] as string[],
  specimenIds: [] as string[],
  locationIds: [] as string[],
  organizationIds: [] as string[],
};

let locationId: string;
let uncleared: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `CLSGATE Org ${RUN}`, organizationType: "farm" },
  });
  created.organizationIds.push(org.id);

  const location = await prisma.location.create({
    // Starts internal: the majority of real locations are, and it is the level
    // the uncleared role must not pass.
    data: { name: `CLSGATE Location ${RUN}`, locationType: "plot", organizationId: org.id, classification: "internal" },
  });
  locationId = location.id;
  created.locationIds.push(location.id);

  // A role holding the action permissions and NO classification clearance.
  // Built here rather than reused from the seed because every seeded role that
  // holds these permissions already clears `internal` — which is why the
  // enforcement change passed the whole suite without a single failure, and
  // why that silence proved nothing.
  const profile = await prisma.roleProfile.create({
    data: { name: `CLSGATE Uncleared ${RUN}`, description: "test-only: action permissions, no clearance" },
  });
  created.roleProfileIds.push(profile.id);

  const permissions = await prisma.permission.findMany({
    where: {
      OR: [
        { resourceType: "location", action: "manage_attributes" },
        { resourceType: "specimen", action: "manage" },
      ],
    },
  });
  expect(permissions.length).toBe(2);
  for (const permission of permissions) {
    // No id to collect: RoleProfilePermission has a composite primary key and
    // cascades from RoleProfile, so deleting the profile takes these with it.
    await prisma.roleProfilePermission.create({
      data: { roleProfileId: profile.id, permissionId: permission.id },
    });
  }

  const person = await prisma.person.create({
    data: { givenName: "CLSGATE", familyName: "Uncleared", displayName: `CLSGATE Uncleared ${RUN}` },
  });
  created.personIds.push(person.id);
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  uncleared = account.id;
  created.userAccountIds.push(account.id);

  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: location.id } });
  created.scopeIds.push(scope.id);
  const assignment = await prisma.assignment.create({
    data: { userAccountId: account.id, roleProfileId: profile.id, scopeId: scope.id, status: "active" },
  });
  created.assignmentIds.push(assignment.id);
});

afterAll(async () => {
  // ADR-045 — never a deleteMany whose where clause could silently become {}.
  // Written out per model rather than through a shared helper: Prisma's
  // delegates do not unify to one structural type, and the cast needed to make
  // them would defeat the point of the guard.
  const w = (ids: string[]) => assertDefinedWhere({ id: { in: ids } });
  if (created.specimenIds.length) await prisma.specimen.deleteMany({ where: w(created.specimenIds) });
  if (created.assignmentIds.length) await prisma.assignment.deleteMany({ where: w(created.assignmentIds) });
  if (created.scopeIds.length) await prisma.scope.deleteMany({ where: w(created.scopeIds) });
  if (created.roleProfileIds.length) await prisma.roleProfile.deleteMany({ where: w(created.roleProfileIds) });
  if (created.userAccountIds.length) await prisma.userAccount.deleteMany({ where: w(created.userAccountIds) });
  if (created.personIds.length) await prisma.person.deleteMany({ where: w(created.personIds) });
  if (created.locationIds.length) await prisma.location.deleteMany({ where: w(created.locationIds) });
  if (created.organizationIds.length) await prisma.organization.deleteMany({ where: w(created.organizationIds) });
});

async function setLocationClassification(level: "public" | "internal") {
  await prisma.location.update({ where: { id: locationId }, data: { classification: level } });
}

describe("location attributes are gated on the Location's own classification", () => {
  it("refuses an internal location to a caller holding the permission but no clearance", async () => {
    await setLocationClassification("internal");
    await expect(
      updateLocationAttributes(uncleared, { locationId, soilType: "volcanic" }),
    ).rejects.toBeInstanceOf(LocationAccessError);
  });

  it("allows the same caller once the location is public — proving the classification is what refused it", async () => {
    // The pair matters more than either half. Only the classification changes
    // between these two cases, so a failure here means the gate is reading
    // something other than the record.
    await setLocationClassification("public");
    const updated = await updateLocationAttributes(uncleared, { locationId, soilType: "volcanic" });
    expect(updated.soilType).toBe("volcanic");
  });

  it("refuses a location that does not exist rather than treating it as public", async () => {
    await expect(
      updateLocationAttributes(uncleared, {
        locationId: "00000000-0000-0000-0000-000000000000",
        soilType: "x",
      }),
    ).rejects.toBeInstanceOf(LocationAccessError);
  });
});

describe("specimens are gated on the classification of the Location they stand at", () => {
  it("refuses to create a specimen at an internal location without clearance", async () => {
    await setLocationClassification("internal");
    await expect(
      createSpecimen(uncleared, {
        locationId,
        specimenType: "plant",
        commonName: "CLSGATE tree",
        provenanceClass: "direct_observation",
      }),
    ).rejects.toBeInstanceOf(SpecimenAccessError);
  });

  it("allows it at a public location", async () => {
    await setLocationClassification("public");
    const specimen = await createSpecimen(uncleared, {
      locationId,
      specimenType: "plant",
      commonName: "CLSGATE tree",
      provenanceClass: "direct_observation",
    });
    created.specimenIds.push(specimen.id);
    expect(specimen.commonName).toBe("CLSGATE tree");
  });
});
