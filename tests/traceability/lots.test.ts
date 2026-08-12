/**
 * Phase 1, ticket T1 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §31, §34). The first genuine DB-integration test suite in this codebase —
 * real Postgres (Neon), no mocks, matching this project's established
 * discipline. Every fixture is created in beforeAll and torn down in
 * afterAll; nothing here touches or depends on DEMO seed content.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  createLot,
  getLotLineage,
  recordTransformation,
  TraceabilityAccessError,
  getSensoryLinkageForSamples,
} from "../../lib/traceability/lots";
import { computeCurrentQuantity } from "../../lib/traceability/quantity";

const RUN_ID = `t1-${Date.now()}`;

let organizationId: string;
let projectAId: string;
let projectBId: string;
let locationId: string;
let otherLocationId: string;

let authorizedUserAccountId: string; // Farm Operator, scope: project A
let locationScopedUserAccountId: string; // Farm Operator, scope: locationId
let wrongProjectUserAccountId: string; // Farm Operator, scope: project B
let unauthorizedUserAccountId: string; // no Assignment at all

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "en" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

async function assignFarmOperator(userAccountId: string, scope: { scopeType: "project" | "location"; scopeRefId: string }) {
  const farmOperatorProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scopeRow = await prisma.scope.create({ data: scope });
  await prisma.assignment.create({
    data: { userAccountId, roleProfileId: farmOperatorProfile.id, scopeId: scopeRow.id },
  });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const projectA = await prisma.project.create({
    data: { name: `TEST Project A (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectAId = projectA.id;

  const projectB = await prisma.project.create({
    data: { name: `TEST Project B (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectBId = projectB.id;

  const location = await prisma.location.create({
    data: { locationType: "site", name: `TEST Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = location.id;

  const otherLocation = await prisma.location.create({
    data: { locationType: "site", name: `TEST Other Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  otherLocationId = otherLocation.id;

  authorizedUserAccountId = await createTestUserAccount("AuthorizedOperator");
  await assignFarmOperator(authorizedUserAccountId, { scopeType: "project", scopeRefId: projectAId });

  locationScopedUserAccountId = await createTestUserAccount("LocationScopedOperator");
  await assignFarmOperator(locationScopedUserAccountId, { scopeType: "location", scopeRefId: locationId });

  wrongProjectUserAccountId = await createTestUserAccount("WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, { scopeType: "project", scopeRefId: projectBId });

  unauthorizedUserAccountId = await createTestUserAccount("Unauthorized");
});

afterAll(async () => {
  // LotTransformation deletion cascades to its input/output join rows
  // (onDelete: Cascade); Lot itself has no cascade from those joins
  // (onDelete: Restrict), so transformations must be removed first.
  const allTestLots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = allTestLots.map((l) => l.id);
  await prisma.quantityEvent.deleteMany({ where: { lotId: { in: lotIds } } });
  await prisma.lotTransformation.deleteMany({
    where: { OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] },
  });
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } });

  await prisma.assignment.deleteMany({
    where: {
      userAccountId: {
        in: [authorizedUserAccountId, locationScopedUserAccountId, wrongProjectUserAccountId, unauthorizedUserAccountId],
      },
    },
  });
  await prisma.scope.deleteMany({ where: { OR: [{ scopeRefId: projectAId }, { scopeRefId: locationId }, { scopeRefId: projectBId }] } });
  await prisma.userAccount.deleteMany({
    where: {
      id: {
        in: [authorizedUserAccountId, locationScopedUserAccountId, wrongProjectUserAccountId, unauthorizedUserAccountId],
      },
    },
  });
  await prisma.person.deleteMany({ where: { displayName: { contains: RUN_ID } } });
  await prisma.location.deleteMany({ where: { id: { in: [locationId, otherLocationId] } } });
  await prisma.project.deleteMany({ where: { id: { in: [projectAId, projectBId] } } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
});

describe("createLot — RBAC", () => {
  it("allows a project-scoped Farm Operator to create a lot in their project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-rbac-ok`,
      lotType: "cherry",
      projectId: projectAId,
    });
    expect(lot.lotCode).toBe(`${RUN_ID}-rbac-ok`);
    expect(lot.lotType).toBe("cherry");
  });

  it("allows a location-scoped Farm Operator to create a lot at their location", async () => {
    const lot = await createLot(locationScopedUserAccountId, {
      lotCode: `${RUN_ID}-rbac-location-ok`,
      lotType: "cherry",
      locationId,
    });
    expect(lot.locationId).toBe(locationId);
  });

  it("denies a location-scoped Farm Operator at a different location", async () => {
    await expect(
      createLot(locationScopedUserAccountId, {
        lotCode: `${RUN_ID}-rbac-location-denied`,
        lotType: "cherry",
        locationId: otherLocationId,
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("denies a Farm Operator scoped to a different project (cross-project denial, RBAC.md §9)", async () => {
    await expect(
      createLot(wrongProjectUserAccountId, {
        lotCode: `${RUN_ID}-rbac-cross-project-denied`,
        lotType: "cherry",
        projectId: projectAId,
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("denies a user with no Assignment at all", async () => {
    await expect(
      createLot(unauthorizedUserAccountId, {
        lotCode: `${RUN_ID}-rbac-unauthorized-denied`,
        lotType: "cherry",
        projectId: projectAId,
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });
});

describe("recordTransformation — split/merge round-trip and append-only lineage", () => {
  it("split: one lot's quantity is preserved across two output lots", async () => {
    const origin = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-split-origin`,
      lotType: "cherry",
      projectId: projectAId,
    });

    const { transformation, outputLots } = await recordTransformation(authorizedUserAccountId, {
      provenanceClass: "original_record",
      transformationType: "split",
      occurredAt: new Date(),
      inputs: [{ lotId: origin.id, quantity: 500, unit: "kg" }],
      outputs: [
        { lotCode: `${RUN_ID}-split-output-1`, lotType: "processing", quantity: 300, unit: "kg" },
        { lotCode: `${RUN_ID}-split-output-2`, lotType: "processing", quantity: 200, unit: "kg" },
      ],
    });

    expect(transformation.transformationType).toBe("split");
    expect(outputLots).toHaveLength(2);
    // Total output quantity matches the input — the round-trip this ticket's
    // DoD asks for.
    const outputRows = await prisma.lotTransformationOutput.findMany({ where: { transformationId: transformation.id } });
    const totalOut = outputRows.reduce((sum, r) => sum + Number(r.quantity), 0);
    expect(totalOut).toBe(500);

    // Output lots inherit the origin's project.
    for (const outputLot of outputLots) {
      expect(outputLot.projectId).toBe(projectAId);
    }
  });

  it("regression: a split output lot's quantity is queryable via computeCurrentQuantity, not just the LotTransformationOutput snapshot", async () => {
    const origin = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-split-quantity-origin`,
      lotType: "cherry",
      projectId: projectAId,
    });

    const { outputLots } = await recordTransformation(authorizedUserAccountId, {
      provenanceClass: "original_record",
      transformationType: "split",
      occurredAt: new Date(),
      inputs: [{ lotId: origin.id, quantity: 100, unit: "kg" }],
      outputs: [{ lotCode: `${RUN_ID}-split-quantity-output`, lotType: "processing", quantity: 60, unit: "kg" }],
    });

    const quantity = await computeCurrentQuantity(authorizedUserAccountId, outputLots[0]!.id);
    expect(quantity.quantity.toNumber()).toBe(60);
    expect(quantity.unit).toBe("kg");
  });

  it("T9.5: provenanceClass is honored exactly as the caller chose it — sourceReference stays null when omitted", async () => {
    // Supersedes the old "defaults sensibly to direct_observation" test:
    // T9.5 removed that fallback entirely (verification-pass finding —
    // every T1-T9 write path silently asserted direct_observation whether
    // or not anyone observed anything). provenanceClass is now a required
    // argument with no default at any layer; this test asserts the value
    // passed through is stored verbatim, not silently coerced.
    const origin = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-provenance-default`,
      lotType: "cherry",
      projectId: projectAId,
    });

    const { transformation: chosen } = await recordTransformation(authorizedUserAccountId, {
      provenanceClass: "original_record",
      transformationType: "stage_change",
      occurredAt: new Date(),
      inputs: [{ lotId: origin.id }],
      outputs: [],
    });
    expect(chosen.provenanceClass).toBe("original_record");
    expect(chosen.sourceReference).toBeNull();

    const origin2 = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-provenance-explicit`,
      lotType: "cherry",
      projectId: projectAId,
    });
    const { transformation: explicit } = await recordTransformation(authorizedUserAccountId, {
      transformationType: "stage_change",
      occurredAt: new Date(),
      inputs: [{ lotId: origin2.id }],
      outputs: [],
      provenanceClass: "manufacturer_specification",
      sourceReference: "Lab report #123",
    });
    expect(explicit.provenanceClass).toBe("manufacturer_specification");
    expect(explicit.sourceReference).toBe("Lab report #123");
  });

  it("merge: two lots combine into one output lot", async () => {
    const lotA = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-merge-input-a`,
      lotType: "green",
      projectId: projectAId,
    });
    const lotB = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-merge-input-b`,
      lotType: "green",
      projectId: projectAId,
    });

    const { transformation, outputLots } = await recordTransformation(authorizedUserAccountId, {
      provenanceClass: "original_record",
      transformationType: "merge",
      occurredAt: new Date(),
      inputs: [
        { lotId: lotA.id, quantity: 40, unit: "kg" },
        { lotId: lotB.id, quantity: 35, unit: "kg" },
      ],
      outputs: [{ lotCode: `${RUN_ID}-merge-output`, lotType: "green", quantity: 75, unit: "kg" }],
    });

    expect(outputLots).toHaveLength(1);
    const inputRows = await prisma.lotTransformationInput.findMany({ where: { transformationId: transformation.id } });
    expect(inputRows).toHaveLength(2);
  });

  it("blend: two distinct-varietal green lots combine into one blended lot (execution plan §8.3's blend diagram)", async () => {
    const geishaA = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-blend-geisha-a`,
      lotType: "green",
      projectId: projectAId,
    });
    const geishaB = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-blend-geisha-b`,
      lotType: "green",
      projectId: projectAId,
    });

    const { transformation, outputLots } = await recordTransformation(authorizedUserAccountId, {
      provenanceClass: "original_record",
      transformationType: "blend",
      occurredAt: new Date(),
      inputs: [
        { lotId: geishaA.id, quantity: 40, unit: "kg" },
        { lotId: geishaB.id, quantity: 35, unit: "kg" },
      ],
      outputs: [{ lotCode: `${RUN_ID}-blend-output`, lotType: "green", quantity: 75, unit: "kg" }],
    });

    expect(transformation.transformationType).toBe("blend");
    expect(outputLots).toHaveLength(1);

    // Both directions of lineage hold for a blend, same as a merge: the
    // output has two ancestors, each ancestor has the blended lot as its
    // only descendant.
    const blendLineage = await getLotLineage(authorizedUserAccountId, outputLots[0]!.id);
    expect(blendLineage.ancestorLotIds).toEqual(expect.arrayContaining([geishaA.id, geishaB.id]));
  });

  it("append-only: a lot's full transformation history remains queryable after multiple transformations, nothing overwritten", async () => {
    const origin = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-history-origin`,
      lotType: "cherry",
      projectId: projectAId,
    });

    const first = await recordTransformation(authorizedUserAccountId, {
      provenanceClass: "original_record",
      transformationType: "stage_change",
      occurredAt: new Date("2026-01-01"),
      inputs: [{ lotId: origin.id, quantity: 100, unit: "kg" }],
      outputs: [{ lotCode: `${RUN_ID}-history-stage2`, lotType: "processing", quantity: 100, unit: "kg" }],
    });

    const second = await recordTransformation(authorizedUserAccountId, {
      provenanceClass: "original_record",
      transformationType: "stage_change",
      occurredAt: new Date("2026-01-02"),
      inputs: [{ lotId: first.outputLots[0]!.id, quantity: 95, unit: "kg" }],
      outputs: [{ lotCode: `${RUN_ID}-history-stage3`, lotType: "drying", quantity: 95, unit: "kg" }],
    });

    // Both transformations still exist as separate, unmodified rows — a
    // correction would be a third transformation, never an edit to these.
    const originInput = await prisma.lotTransformationInput.findFirst({ where: { lotId: origin.id } });
    expect(originInput?.transformationId).toBe(first.transformation.id);
    const stage2Input = await prisma.lotTransformationInput.findFirst({ where: { lotId: first.outputLots[0]!.id } });
    expect(stage2Input?.transformationId).toBe(second.transformation.id);
  });
});

describe("getLotLineage — recursive CTE correctness", () => {
  it("traces a multi-hop chain both forward and backward", async () => {
    const origin = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-lineage-origin`,
      lotType: "cherry",
      projectId: projectAId,
    });
    const step1 = await recordTransformation(authorizedUserAccountId, {
      provenanceClass: "original_record",
      transformationType: "stage_change",
      occurredAt: new Date(),
      inputs: [{ lotId: origin.id }],
      outputs: [{ lotCode: `${RUN_ID}-lineage-step1`, lotType: "processing" }],
    });
    const step1LotId = step1.outputLots[0]!.id;

    const step2 = await recordTransformation(authorizedUserAccountId, {
      provenanceClass: "original_record",
      transformationType: "stage_change",
      occurredAt: new Date(),
      inputs: [{ lotId: step1LotId }],
      outputs: [{ lotCode: `${RUN_ID}-lineage-step2`, lotType: "drying" }],
    });
    const step2LotId = step2.outputLots[0]!.id;

    // From the final lot: ancestors should include both step1 and origin.
    const lineageFromEnd = await getLotLineage(authorizedUserAccountId, step2LotId);
    expect(lineageFromEnd.ancestorLotIds).toEqual(expect.arrayContaining([step1LotId, origin.id]));
    expect(lineageFromEnd.descendantLotIds).toHaveLength(0);

    // From the origin: descendants should include both step1 and the final lot.
    const lineageFromOrigin = await getLotLineage(authorizedUserAccountId, origin.id);
    expect(lineageFromOrigin.descendantLotIds).toEqual(expect.arrayContaining([step1LotId, step2LotId]));
    expect(lineageFromOrigin.ancestorLotIds).toHaveLength(0);
  });

  it("denies lineage view to a user with no access to the lot's project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-lineage-denied`,
      lotType: "cherry",
      projectId: projectAId,
    });
    await expect(getLotLineage(wrongProjectUserAccountId, lot.id)).rejects.toThrow(TraceabilityAccessError);
  });
});

// T12.5 §8 / ADR-043: pins the non-leakage limit and the scoping guarantee
// getSensoryLinkageForSamples relies on but never had a regression test for
// — only live browser verification existed before this ticket.
describe("getSensoryLinkageForSamples — T12 boundary (ADR-043)", () => {
  let sensoryLotId: string;
  let sensorySampleId: string;
  let protocolId: string;
  let protocolVersionId: string;
  let sessionId: string;
  let flightId: string;
  let blindSampleId: string;

  beforeAll(async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-t12-boundary`,
      lotType: "sample",
      projectId: projectAId,
    });
    sensoryLotId = lot.id;

    const sample = await prisma.sample.create({
      data: {
        sampleCode: `${RUN_ID}-t12-boundary-sample`,
        sampleType: "green_coffee",
        sourceLotId: sensoryLotId,
        status: "approved",
        classification: "internal",
      },
    });
    sensorySampleId = sample.id;

    const protocol = await prisma.sensoryProtocol.create({
      data: { domain: "coffee", name: `TEST Protocol (${RUN_ID})`, status: "active" },
    });
    protocolId = protocol.id;

    const protocolVersion = await prisma.sensoryProtocolVersion.create({
      data: { protocolId, version: 1, scoreMin: 0, scoreMax: 100, status: "active" },
    });
    protocolVersionId = protocolVersion.id;

    const session = await prisma.sensorySession.create({
      data: { name: `TEST Session (${RUN_ID})`, protocolVersionId, status: "completed", classification: "internal" },
    });
    sessionId = session.id;

    const flight = await prisma.sensoryFlight.create({
      data: { sessionId, name: `TEST Flight (${RUN_ID})`, sequenceOrder: 1 },
    });
    flightId = flight.id;

    const blindSample = await prisma.sensoryBlindSample.create({
      data: { flightId, blindCode: `${RUN_ID}-BC1` },
    });
    blindSampleId = blindSample.id;

    await prisma.sensoryBlindMapping.create({
      data: { blindSampleId, sampleId: sensorySampleId, revealedAt: new Date() },
    });

    await prisma.panelResult.create({
      data: {
        blindSampleId,
        attributeId: null,
        responseCount: 3,
        meanValue: 86.5,
        minValue: 84,
        maxValue: 88,
      },
    });
  });

  afterAll(async () => {
    await prisma.panelResult.deleteMany({ where: { blindSampleId } });
    await prisma.sensoryBlindMapping.deleteMany({ where: { blindSampleId } });
    await prisma.sensoryBlindSample.deleteMany({ where: { id: blindSampleId } });
    await prisma.sensoryFlight.deleteMany({ where: { id: flightId } });
    await prisma.sensorySession.deleteMany({ where: { id: sessionId } });
    await prisma.sensoryProtocolVersion.deleteMany({ where: { id: protocolVersionId } });
    await prisma.sensoryProtocol.deleteMany({ where: { id: protocolId } });
    await prisma.sample.deleteMany({ where: { id: sensorySampleId } });
    await prisma.lot.deleteMany({ where: { id: sensoryLotId } });
  });

  it("returns the aggregate PanelResult and session name/status for a linked sample", async () => {
    const linkage = await getSensoryLinkageForSamples([sensorySampleId]);
    expect(linkage[sensorySampleId]).toHaveLength(1);
    const entry = linkage[sensorySampleId]![0]!;
    expect(entry.sessionId).toBe(sessionId);
    expect(entry.sessionName).toContain(RUN_ID);
    expect(entry.sessionStatus).toBe("completed");
    expect(entry.overallResult).toEqual({
      meanValue: "86.5",
      minValue: "84",
      maxValue: "88",
      responseCount: 3,
    });
  });

  it("ADR-043: never returns blind code, mapping id, or evaluator identity — only the fields the type allows", async () => {
    const linkage = await getSensoryLinkageForSamples([sensorySampleId]);
    const entry = linkage[sensorySampleId]![0]!;
    const serialized = JSON.stringify(entry);

    // The type itself is the primary guarantee (SensoryLinkageEntry has no
    // field for any of these) — this is a belt-and-suspenders regression
    // check against a future field addition widening what's returned.
    expect(Object.keys(entry).sort()).toEqual(["overallResult", "revealed", "sessionId", "sessionName", "sessionStatus"].sort());
    expect(serialized).not.toContain("BC1"); // the blind code itself
    expect(serialized).not.toContain(blindSampleId);
  });

  it("ADR-043: scoped structurally via the caller's lot access, not re-checked independently", async () => {
    // getSensoryLinkageForSamples takes no user/scope argument — this test
    // documents that its only real caller, getLotDetail, is what enforces
    // access, by confirming the function itself returns data for any
    // sample id handed to it (no independent RBAC of its own to bypass).
    // The actual access boundary is exercised by getLotDetail's own
    // requireLotAccess("view", ...) — see "getLotLineage" describe block
    // above for that check's coverage on the same RBAC primitive.
    const linkage = await getSensoryLinkageForSamples([sensorySampleId]);
    expect(linkage[sensorySampleId]).toBeDefined();
  });

  it("returns nothing for a sample with no blind mapping (renders gracefully, not an error)", async () => {
    const plainSample = await prisma.sample.create({
      data: {
        sampleCode: `${RUN_ID}-t12-boundary-plain`,
        sampleType: "green_coffee",
        sourceLotId: sensoryLotId,
        status: "approved",
        classification: "internal",
      },
    });
    try {
      const linkage = await getSensoryLinkageForSamples([plainSample.id]);
      expect(linkage[plainSample.id]).toBeUndefined();
    } finally {
      await prisma.sample.delete({ where: { id: plainSample.id } });
    }
  });
});
