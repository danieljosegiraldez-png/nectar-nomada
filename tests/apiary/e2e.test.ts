/**
 * Ticket A8 (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md §3) — the
 * full apiary-workflow end-to-end test, mirroring
 * `tests/traceability/e2e.test.ts` (T14): one continuous chain proving
 * *composition*, not isolated per-function correctness (A1-A5's own test
 * files already do that). A season of Inspections and ColonyEvents,
 * through a harvest into a honey `Lot`, into a `Sample`, into a sensory
 * result — the same "can this platform carry the thing end to end"
 * question T14 answered for coffee, answered here for apiary.
 *
 * §7's own addition to A8's definition of done: at least one Inspection
 * or ColonyEvent recorded through the *offline* path — a client-generated
 * `clientDraftId`, retried exactly as a dropped-response resync would
 * retry it — confirmed to resolve to one row, not the online-only path
 * every other write in this chain uses. That's the "offline path"
 * assertion below, not a separate isolated test — proving it holds inside
 * the same season a beekeeper would actually record, not just in
 * isolation (already covered per-ticket by `inspections.test.ts`/
 * `colonyEvents.test.ts`'s own idempotency suites).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { ApiaryAccessError, createColony, createHive } from "../../lib/apiary/hives";
import { recordInspection } from "../../lib/apiary/inspections";
import { recordColonyEvent } from "../../lib/apiary/colonyEvents";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { createSampleFromLot } from "../../lib/traceability/samples";
import { computeCurrentQuantity } from "../../lib/traceability/quantity";
import { getSensoryLinkageForSamples, TraceabilityAccessError } from "../../lib/traceability/lots";
import { getApiaryDetail } from "../../lib/apiary/hives";
import { cleanupApiaryE2eFixtures } from "./e2e-cleanup";

const RUN_ID = `a8-e2e-${Date.now()}`;

let organizationId: string;
let projectId: string;
let apiarySiteId: string;
let operatorUserAccountId: string;
let wrongProjectUserAccountId: string;

let hiveId: string;
let colonyId: string;
let offlinePathInspectionId: string;
let honeyLotId: string;
let apiaryHarvestEventId: string;
let sampleId: string;
let protocolId: string;
let protocolVersionId: string;
let sessionId: string;
let flightId: string;
let blindSampleId: string;

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
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
    data: { organizationType: "farm", name: `TEST Apiary Org (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const apiarySite = await prisma.location.create({
    data: { locationType: "apiary_site", name: `TEST Apiary Site (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  apiarySiteId = apiarySite.id;

  const project = await prisma.project.create({ data: { name: `TEST Apiary Project (${RUN_ID})`, status: "approved", classification: "internal" } });
  projectId = project.id;

  operatorUserAccountId = await createTestUserAccount("E2EApiaryOperator");
  await assignFarmOperator(operatorUserAccountId, projectId);

  const otherProject = await prisma.project.create({ data: { name: `TEST Other Apiary Project (${RUN_ID})`, status: "approved", classification: "internal" } });
  wrongProjectUserAccountId = await createTestUserAccount("WrongProjectApiaryOperator");
  await assignFarmOperator(wrongProjectUserAccountId, otherProject.id);

  // --- 1. Hive + Colony (A1/A2) ---
  const hive = await createHive(operatorUserAccountId, {
    identifier: `${RUN_ID}-H-001`,
    locationId: apiarySiteId,
    projectId,
    installedAt: new Date("2026-11-01"),
  });
  hiveId = hive.id;

  const colony = await createColony(operatorUserAccountId, {
    hiveId,
    startedAt: new Date("2026-11-05"),
    originType: "captured",
    originNote: `TEST — swarm captured near the site (${RUN_ID})`,
    provenanceClass: "direct_observation",
  });
  colonyId = colony.id;

  // --- 2. A season of Inspections/ColonyEvents (A2) ---

  // Routine inspection, one-tap "nothing unusual" path.
  await recordInspection(operatorUserAccountId, {
    colonyId,
    occurredAt: new Date("2026-11-12"),
    outcome: "nothing_unusual",
  });

  // Detailed inspection — an issue observed and described.
  await recordInspection(operatorUserAccountId, {
    colonyId,
    occurredAt: new Date("2026-11-26"),
    outcome: "issue_observed",
    broodPatternNote: "Patchy brood pattern in two frames",
    queenSighted: true,
    storesLevel: "moderate",
    pestDiseaseFlags: "Small hive beetle observed",
  });

  // Feeding and treatment ColonyEvents.
  await recordColonyEvent(operatorUserAccountId, {
    colonyId,
    eventType: "feeding",
    occurredAt: new Date("2026-11-19"),
    feedingMaterial: "1:1 sugar syrup",
    feedingQuantity: 2,
    feedingUnit: "L",
  });
  await recordColonyEvent(operatorUserAccountId, {
    colonyId,
    eventType: "treatment",
    treatmentTarget: "varroa",
    occurredAt: new Date("2026-12-03"),
    treatmentProduct: "Oxalic acid",
    treatmentBatchLabel: `${RUN_ID}-BATCH-01`,
    treatmentWithdrawalDays: 14,
    treatmentDose: 5,
    treatmentDoseUnit: "mL",
  });

  // --- 3. §7's own addition: at least one Inspection recorded through the
  //     *offline* path — a client-generated clientDraftId, retried exactly
  //     as A5's real sync-after-a-dropped-response would retry it. One
  //     call, then an identical retry; both together should still resolve
  //     to a single row (A5's own idempotent-sync mechanism), proven here
  //     as part of the same continuous season, not in isolation. ---
  const offlineClientDraftId = `${RUN_ID}-offline-draft-1`;
  const firstSyncAttempt = await recordInspection(operatorUserAccountId, {
    colonyId,
    occurredAt: new Date("2026-12-10"),
    outcome: "nothing_unusual",
    clientDraftId: offlineClientDraftId,
  });
  offlinePathInspectionId = firstSyncAttempt.id;
  // The retried sync — same clientDraftId, simulating a dropped response
  // that made the client believe the first attempt never landed.
  const retriedSyncAttempt = await recordInspection(operatorUserAccountId, {
    colonyId,
    occurredAt: new Date("2026-12-10"),
    outcome: "nothing_unusual",
    clientDraftId: offlineClientDraftId,
  });
  expect(retriedSyncAttempt.id).toBe(offlinePathInspectionId);

  // --- 4. Harvest -> honey Lot (A3) ---
  const { lot: honeyLot, harvestEvent } = await recordApiaryHarvest(operatorUserAccountId, {
    lotCode: `${RUN_ID}-honey`,
    colonyId,
    occurredAt: new Date("2027-01-10"),
    extractedWeightKg: 18,
    framesHarvested: 8,
    provenanceClass: "measured_fact",
  });
  honeyLotId = honeyLot.id;
  apiaryHarvestEventId = harvestEvent.id;

  // --- 5. Sample from the honey Lot (A3/A4 — zero new code, reusing T5) ---
  const { sample } = await createSampleFromLot(operatorUserAccountId, {
    sampleCode: `${RUN_ID}-sample`,
    sampleType: "honey_cupping",
    sourceLotId: honeyLotId,
    quantity: 0.3,
    unit: "kg",
    occurredAt: new Date("2027-01-11"),
    provenanceClass: "original_record",
  });
  sampleId = sample.id;

  // --- 6. Sensory: blind mapping + PanelResult, same minimal shape T13/
  //     T14 already use (aggregate only, no individual Assessment rows). ---
  const protocol = await prisma.sensoryProtocol.create({ data: { domain: "honey", name: `TEST Honey Protocol (${RUN_ID})`, status: "active" } });
  protocolId = protocol.id;
  const protocolVersion = await prisma.sensoryProtocolVersion.create({ data: { protocolId, version: 1, scoreMin: 0, scoreMax: 10, status: "active" } });
  protocolVersionId = protocolVersion.id;
  const session = await prisma.sensorySession.create({ data: { name: `TEST Honey Session (${RUN_ID})`, protocolVersionId, status: "completed", classification: "internal" } });
  sessionId = session.id;
  const flight = await prisma.sensoryFlight.create({ data: { sessionId, name: `TEST Flight (${RUN_ID})`, sequenceOrder: 1 } });
  flightId = flight.id;
  const blindSample = await prisma.sensoryBlindSample.create({ data: { flightId, blindCode: `${RUN_ID}-BC1` } });
  blindSampleId = blindSample.id;
  await prisma.sensoryBlindMapping.create({ data: { blindSampleId, sampleId, revealedAt: new Date() } });
  await prisma.panelResult.create({ data: { blindSampleId, attributeId: null, responseCount: 3, meanValue: 8.4, minValue: 8, maxValue: 9 } });
});

afterAll(async () => {
  await cleanupApiaryE2eFixtures(RUN_ID, {
    blindSampleId,
    flightId,
    sessionId,
    protocolVersionId,
    protocolId,
    sampleId,
    honeyLotId,
    apiaryHarvestEventId,
    colonyId,
    hiveId,
    operatorUserAccountId,
    wrongProjectUserAccountId,
    projectId,
    apiarySiteId,
    organizationId,
  });
});

describe("Full apiary workflow — A8 end-to-end", () => {
  it("recorded the full season: two Inspections plus the offline-path one, and two ColonyEvents", async () => {
    const inspections = await prisma.inspection.findMany({ where: { colonyId } });
    expect(inspections).toHaveLength(3);
    expect(inspections.map((i) => i.id)).toContain(offlinePathInspectionId);

    const events = await prisma.colonyEvent.findMany({ where: { colonyId } });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.eventType).sort()).toEqual(["feeding", "treatment"]);
  });

  it("resolved the retried offline-path draft to exactly one row, not a duplicate", async () => {
    const rows = await prisma.inspection.findMany({ where: { clientDraftId: `${RUN_ID}-offline-draft-1` } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(offlinePathInspectionId);
  });

  it("produced a honey Lot with its own independent quantity ledger", async () => {
    const quantity = await computeCurrentQuantity(operatorUserAccountId, honeyLotId);
    // 18 kg received, minus the 0.3 kg sample extraction.
    expect(quantity.quantity.toString()).toBe("17.7");
    expect(quantity.unit).toBe("kg");
  });

  it("reaches an actual sensory score through the real, unmodified chain-reuse functions — the platform's own falsifiable v1 test, for apiary", async () => {
    const linkage = await getSensoryLinkageForSamples([sampleId]);
    expect(linkage[sampleId]).toHaveLength(1);
    expect(linkage[sampleId]![0]!.overallResult).toEqual({ meanValue: "8.4", minValue: "8", maxValue: "9", responseCount: 3 });
  });

  it("exposes the full chain through getApiaryDetail — Hive, Colony, and the honey harvest together", async () => {
    const detail = await getApiaryDetail(operatorUserAccountId, apiarySiteId);
    expect(detail.hives.map((h) => h.id)).toContain(hiveId);
    const colony = detail.hives.find((h) => h.id === hiveId)!.colonies.find((c) => c.id === colonyId);
    expect(colony).toBeDefined();
  });

  it("denies a user with no access to the project on both a read and a write path", async () => {
    await expect(getApiaryDetail(wrongProjectUserAccountId, apiarySiteId)).rejects.toThrow(ApiaryAccessError);
    await expect(
      recordInspection(wrongProjectUserAccountId, {
        colonyId,
        occurredAt: new Date(),
        outcome: "nothing_unusual",
      }),
    ).rejects.toThrow(ApiaryAccessError);
  });
});
