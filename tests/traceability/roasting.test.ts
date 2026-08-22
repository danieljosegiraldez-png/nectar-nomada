/**
 * R1 (docs/implementation/33_R1_ROASTSESSION_TAXONOMIA_SENSORIAL.md §1, §4).
 * Real Postgres (Neon), no mocks. Covers §4.1 (roast profile queryable, not
 * just by lot code), §4.2 (roaster as a comparable variable across
 * equipment), §4.3 (pre-roast green measurement distinguished from
 * storage-phase), and §4.5 (A7/F1/S1 real data intact).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { getRoastSessionDetail, listRoastSessions, recordRoastSession, RoastSessionValidationError } from "../../lib/traceability/roasting";
import { recordMeasurement } from "../../lib/traceability/measurements";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `r1-roast-${Date.now()}`;

let organizationId: string;
let projectId: string;
let otherProjectId: string;
let greenLotId: string;
let authorizedUserAccountId: string;
let wrongProjectUserAccountId: string;
let gabrielPersonId: string;
let mariaPersonId: string;

const outputLotIds: string[] = [];

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "en" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

async function assignFarmOperator(userAccountId: string, projectRefId: string) {
  const farmOperatorProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectRefId } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperatorProfile.id, scopeId: scope.id } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "roaster", name: `TEST Roastery (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const project = await prisma.project.create({ data: { name: `TEST R1 Project (${RUN_ID})`, status: "approved", classification: "internal" } });
  projectId = project.id;
  const otherProject = await prisma.project.create({ data: { name: `TEST R1 Other Project (${RUN_ID})`, status: "approved", classification: "internal" } });
  otherProjectId = otherProject.id;

  const greenLot = await prisma.lot.create({
    data: { lotCode: `${RUN_ID}-green`, lotType: "green", organizationId, projectId },
  });
  greenLotId = greenLot.id;

  authorizedUserAccountId = await createTestUserAccount("R1Operator");
  await assignFarmOperator(authorizedUserAccountId, projectId);
  wrongProjectUserAccountId = await createTestUserAccount("R1WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, otherProjectId);

  const gabriel = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Gabriel", displayName: `TEST Gabriel (${RUN_ID})`, locale: "es" },
  });
  gabrielPersonId = gabriel.id;
  const maria = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Maria", displayName: `TEST Maria (${RUN_ID})`, locale: "es" },
  });
  mariaPersonId = maria.id;
});

afterAll(async () => {
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: greenLotId }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: [greenLotId, ...outputLotIds] } }) });
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: greenLotId } } }, { outputs: { some: { lotId: { in: outputLotIds } } } }] }),
  });
  await prisma.roastSession.deleteMany({
    where: assertDefinedWhere({ roasterPersonId: { in: [gabrielPersonId, mariaPersonId] } }),
  });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: [greenLotId, ...outputLotIds] } }) });

  const userAccountIds = [authorizedUserAccountId, wrongProjectUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [projectId, otherProjectId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectId, otherProjectId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("recordRoastSession — validation and access", () => {
  it("rejects a user with no access to the source lot's project", async () => {
    await expect(
      recordRoastSession(wrongProjectUserAccountId, {
        lotId: greenLotId,
        outputLotCode: `${RUN_ID}-reject-access`,
        startedAt: new Date("2027-01-10T08:00:00Z"),
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("rejects an end time before the start time", async () => {
    await expect(
      recordRoastSession(authorizedUserAccountId, {
        lotId: greenLotId,
        outputLotCode: `${RUN_ID}-reject-time`,
        startedAt: new Date("2027-01-10T08:15:00Z"),
        endedAt: new Date("2027-01-10T08:00:00Z"),
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(RoastSessionValidationError);
  });

  it("rejects a discharge weight exceeding the charge weight", async () => {
    await expect(
      recordRoastSession(authorizedUserAccountId, {
        lotId: greenLotId,
        outputLotCode: `${RUN_ID}-reject-weight`,
        startedAt: new Date("2027-01-10T08:00:00Z"),
        chargeWeightKg: 10,
        dischargeWeightKg: 12,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(RoastSessionValidationError);
  });
});

describe("§4.1 — one green lot roasted three ways, queryable by profile", () => {
  it("records three separate RoastSessions from the same green lot, each independently queryable by roastLevel", async () => {
    const profiles = ["claro filtro", "medio espresso", "oscuro"];
    for (const [i, roastLevel] of profiles.entries()) {
      const { roastSession, outputLot } = await recordRoastSession(authorizedUserAccountId, {
        lotId: greenLotId,
        outputLotCode: `${RUN_ID}-roast-${i}`,
        roastLevel,
        chargeWeightKg: 5,
        dischargeWeightKg: 4.2,
        startedAt: new Date(`2027-01-10T${String(8 + i).padStart(2, "0")}:00:00Z`),
        endedAt: new Date(`2027-01-10T${String(8 + i).padStart(2, "0")}:12:00Z`),
        provenanceClass: "direct_observation",
      });
      outputLotIds.push(outputLot.id);
      expect(roastSession.roastLevel).toBe(roastLevel);
      expect(outputLot.lotType).toBe("roast");
    }

    const claroSessions = await listRoastSessions(authorizedUserAccountId, { roastLevel: "claro filtro" });
    expect(claroSessions.length).toBeGreaterThanOrEqual(1);
    expect(claroSessions.every((s) => s.roastLevel === "claro filtro")).toBe(true);

    // All three roasts share the same source green lot as input — the DAG
    // has three children from one parent, even though each is its own
    // stage_change transformation rather than one shared split.
    const allFromThisLot = await listRoastSessions(authorizedUserAccountId, {});
    const ourSessions = allFromThisLot.filter((s) => s.transformations.some((t) => t.inputs.some((i) => i.lot.id === greenLotId)));
    expect(ourSessions.length).toBe(3);
  });
});

describe("§4.2 — same coffee, two roasters, two machines — roaster as a queryable variable", () => {
  it("records Gabriel and Maria roasting the same green lot on different equipment, each independently queryable by roaster", async () => {
    const { roastSession: gabrielSession, outputLot: gabrielLot } = await recordRoastSession(authorizedUserAccountId, {
      lotId: greenLotId,
      outputLotCode: `${RUN_ID}-gabriel`,
      roastLevel: "medio",
      equipmentNote: "TEST Probat 5kg",
      roasterPersonId: gabrielPersonId,
      startedAt: new Date("2027-01-11T08:00:00Z"),
      provenanceClass: "direct_observation",
    });
    outputLotIds.push(gabrielLot.id);

    const { roastSession: mariaSession, outputLot: mariaLot } = await recordRoastSession(authorizedUserAccountId, {
      lotId: greenLotId,
      outputLotCode: `${RUN_ID}-maria`,
      roastLevel: "medio",
      equipmentNote: "TEST Loring S15",
      roasterPersonId: mariaPersonId,
      startedAt: new Date("2027-01-11T09:00:00Z"),
      provenanceClass: "direct_observation",
    });
    outputLotIds.push(mariaLot.id);

    expect(gabrielSession.roasterPersonId).toBe(gabrielPersonId);
    expect(mariaSession.roasterPersonId).toBe(mariaPersonId);
    expect(gabrielSession.equipmentNote).not.toBe(mariaSession.equipmentNote);

    const gabrielSessions = await listRoastSessions(authorizedUserAccountId, { roasterPersonId: gabrielPersonId });
    const mariaSessions = await listRoastSessions(authorizedUserAccountId, { roasterPersonId: mariaPersonId });
    expect(gabrielSessions.some((s) => s.id === gabrielSession.id)).toBe(true);
    expect(gabrielSessions.some((s) => s.id === mariaSession.id)).toBe(false);
    expect(mariaSessions.some((s) => s.id === mariaSession.id)).toBe(true);
  });

  it("rejects a user with no access when reading roast session detail", async () => {
    const { roastSession } = await recordRoastSession(authorizedUserAccountId, {
      lotId: greenLotId,
      outputLotCode: `${RUN_ID}-detail-access`,
      startedAt: new Date("2027-01-12T08:00:00Z"),
      provenanceClass: "direct_observation",
    });
    const detail = await getRoastSessionDetail(authorizedUserAccountId, roastSession.id);
    expect(detail.id).toBe(roastSession.id);
    outputLotIds.push(detail.transformations[0]!.outputs[0]!.lot.id);

    await expect(getRoastSessionDetail(wrongProjectUserAccountId, roastSession.id)).rejects.toThrow(TraceabilityAccessError);
  });
});

describe("§4.3 — pre-roast green measurement distinguished from a storage-phase one", () => {
  it("a measurement carrying roastSessionId is distinguishable from an ordinary Lot measurement with none", async () => {
    const { roastSession } = await recordRoastSession(authorizedUserAccountId, {
      lotId: greenLotId,
      outputLotCode: `${RUN_ID}-moisture`,
      startedAt: new Date("2027-01-13T08:00:00Z"),
      provenanceClass: "direct_observation",
    });
    const detail = await getRoastSessionDetail(authorizedUserAccountId, roastSession.id);
    outputLotIds.push(detail.transformations[0]!.outputs[0]!.lot.id);

    const preRoastMeasurement = await recordMeasurement(authorizedUserAccountId, {
      variable: "moisture",
      value: 10.5,
      unit: "%",
      occurredAt: new Date("2027-01-13T07:55:00Z"),
      lotId: greenLotId,
      roastSessionId: roastSession.id,
      provenanceClass: "measured_fact",
    });
    const storagePhaseMeasurement = await recordMeasurement(authorizedUserAccountId, {
      variable: "moisture",
      value: 11.2,
      unit: "%",
      occurredAt: new Date("2027-01-01T08:00:00Z"),
      lotId: greenLotId,
      provenanceClass: "measured_fact",
    });

    expect(preRoastMeasurement.roastSessionId).toBe(roastSession.id);
    expect(storagePhaseMeasurement.roastSessionId).toBeNull();
    expect(preRoastMeasurement.lotId).toBe(storagePhaseMeasurement.lotId);
  });
});

describe("§4.5 — A7/F1/S1 real data left untouched", () => {
  it("Cerro Azul real data is unaffected by R1's writes", async () => {
    const lasNubesProjects = await prisma.project.findMany({ where: { name: { contains: "Nubes" } } });
    // Scoped to Cerro Azul, which is what this assertion is actually about.
    // It previously counted every Location named "Lote" anywhere on the
    // platform and expected exactly 6 — so any legitimate new plot broke it.
    // I1's Cafelino import creates real plots ("Lote 9 — Cafelino", "Lote 10 —
    // Cafelino"), which made this fail without anything having touched Cerro
    // Azul at all. The guarantee worth keeping is that Cerro Azul's own six
    // are untouched, not that the platform never grows a seventh plot.
    const lotes = await prisma.location.findMany({
      where: { AND: [{ name: { contains: "Lote" } }, { name: { contains: "Cerro Azul" } }] },
    });
    expect(lasNubesProjects.length).toBe(2);
    expect(lotes.length).toBe(6);

    const roastSessionResidue = await prisma.roastSession.findMany({ where: { roasterPersonId: { in: [gabrielPersonId, mariaPersonId] } } });
    expect(roastSessionResidue.length).toBeGreaterThan(0); // still present mid-suite, cleaned in afterAll
  });
});
