/**
 * Phase 1, ticket T14 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §31, §34) — the full coffee-workflow end-to-end test, as an automated
 * *.test.ts file rather than only a one-time manual verification pass.
 *
 * Unlike per-ticket tests (T1-T13), which each prove one function or one
 * new table in isolation, this file's job is to prove the *composition*:
 * one continuous chain, harvest through sensory, with every stage's own
 * quantity ledger, lineage, RBAC gate, and report rendering checked
 * together against real Neon. T13's own reports.test.ts already builds a
 * harvest -> fermentation -> drying -> sample -> sensory chain to test
 * getLotReport's rendering specifically — this file adds the one stage
 * that chain never touched (Storage) and shifts the assertions from "does
 * the report render this" to "is the state actually correct at each step,
 * end to end."
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { getLotLineage, TraceabilityAccessError } from "../../lib/traceability/lots";
import { recordHarvestEvent } from "../../lib/traceability/harvest";
import { startFermentationRun, endFermentationRun } from "../../lib/traceability/fermentation";
import { startDryingRun, endDryingRun } from "../../lib/traceability/drying";
import { moveLotToStorage } from "../../lib/traceability/storage";
import { recordMeasurement } from "../../lib/traceability/measurements";
import { createSampleFromLot } from "../../lib/traceability/samples";
import { computeCurrentQuantity } from "../../lib/traceability/quantity";
import { getLotReport } from "../../lib/traceability/reports";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `t14-e2e-${Date.now()}`;

let organizationId: string;
let projectId: string;
let plotLocationId: string;
let warehouseLocationId: string;
let operatorUserAccountId: string;
let wrongProjectUserAccountId: string;

let cherryLotId: string;
let dryingStageLotId: string;
let greenLotId: string;
let fermentationRunId: string;
let dryingRunId: string;
let storageAssignmentId: string;
let sampleId: string;
let protocolId: string;
let protocolVersionId: string;
let sessionId: string;
let flightId: string;
let blindSampleId: string;

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
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const project = await prisma.project.create({ data: { name: `TEST Project (${RUN_ID})`, status: "approved", classification: "internal" } });
  projectId = project.id;

  const plotLocation = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  plotLocationId = plotLocation.id;

  const warehouseLocation = await prisma.location.create({
    data: { locationType: "site", name: `TEST Warehouse (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  warehouseLocationId = warehouseLocation.id;

  operatorUserAccountId = await createTestUserAccount("E2EOperator");
  await assignFarmOperator(operatorUserAccountId, projectId);

  const otherProject = await prisma.project.create({ data: { name: `TEST Other Project (${RUN_ID})`, status: "approved", classification: "internal" } });
  wrongProjectUserAccountId = await createTestUserAccount("WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, otherProject.id);

  // --- 1. Harvest: cherry lot, 500 kg received ---
  const { lot: cherryLot } = await recordHarvestEvent(operatorUserAccountId, {
    lotCode: `${RUN_ID}-cherry`,
    locationId: plotLocationId,
    organizationId,
    projectId,
    harvestedAt: new Date("2027-01-15T08:00:00Z"),
    cherryWeightKg: 500,
    brix: 22,
    provenanceClass: "measured_fact",
  });
  cherryLotId = cherryLot.id;

  // --- 2. Fermentation: cherry lot (500 kg in) -> drying-stage lot (480 kg out) ---
  const { run: fermentationRun } = await startFermentationRun(operatorUserAccountId, {
    lotId: cherryLotId,
    startedAt: new Date("2027-01-15T10:00:00Z"),
    quantity: 500,
    unit: "kg",
    provenanceClass: "original_record",
  });
  fermentationRunId = fermentationRun.id;

  const { outputLot: fermentationOutputLot } = await endFermentationRun(operatorUserAccountId, {
    fermentationRunId,
    endedAt: new Date("2027-01-17T10:00:00Z"),
    outputLotCode: `${RUN_ID}-drying`,
    outputLotType: "drying",
    quantity: 480,
    unit: "kg",
    provenanceClass: "original_record",
  });
  dryingStageLotId = fermentationOutputLot.id;

  // --- 3. Drying: drying-stage lot (480 kg in) -> green lot (400 kg out) ---
  const { run: dryingRun } = await startDryingRun(operatorUserAccountId, {
    lotId: dryingStageLotId,
    startedAt: new Date("2027-01-17T11:00:00Z"),
    quantity: 480,
    unit: "kg",
    provenanceClass: "original_record",
  });
  dryingRunId = dryingRun.id;

  const { outputLot: dryingOutputLot } = await endDryingRun(operatorUserAccountId, {
    dryingRunId,
    endedAt: new Date("2027-01-30T11:00:00Z"),
    outputLotCode: `${RUN_ID}-green`,
    outputLotType: "green",
    quantity: 400,
    unit: "kg",
    provenanceClass: "original_record",
  });
  greenLotId = dryingOutputLot.id;

  // --- 4. Storage: green lot moved to the warehouse — the one stage
  //     T13's own E2E chain never exercised, so getLotReport's
  //     storageAssignments field has never actually been proven live.
  const storageAssignment = await moveLotToStorage(operatorUserAccountId, {
    lotId: greenLotId,
    locationId: warehouseLocationId,
    containerNote: `TEST bin (${RUN_ID})`,
    startedAt: new Date("2027-01-30T12:00:00Z"),
  });
  storageAssignmentId = storageAssignment.id;

  // --- 5. Measurement against the stored green lot ---
  await recordMeasurement(operatorUserAccountId, {
    variable: "moisture",
    value: 11.2,
    unit: "%",
    occurredAt: new Date("2027-01-30T12:30:00Z"),
    lotId: greenLotId,
    provenanceClass: "measured_fact",
  });

  // --- 6. Sample: 2 kg extracted from the green lot ---
  const sample = await createSampleFromLot(operatorUserAccountId, {
    sampleCode: `${RUN_ID}-sample`,
    sampleType: "green_coffee",
    sourceLotId: greenLotId,
    quantity: 2,
    unit: "kg",
    occurredAt: new Date("2027-01-31T09:00:00Z"),
    provenanceClass: "original_record",
  });
  sampleId = sample.sample.id;

  // --- 7. Sensory: blind mapping + PanelResult (same shape as T13's own fixture) ---
  const protocol = await prisma.sensoryProtocol.create({ data: { domain: "coffee", name: `TEST Protocol (${RUN_ID})`, status: "active" } });
  protocolId = protocol.id;
  const protocolVersion = await prisma.sensoryProtocolVersion.create({ data: { protocolId, version: 1, scoreMin: 0, scoreMax: 100, status: "active" } });
  protocolVersionId = protocolVersion.id;
  const session = await prisma.sensorySession.create({ data: { name: `TEST Session (${RUN_ID})`, protocolVersionId, status: "completed", classification: "internal" } });
  sessionId = session.id;
  const flight = await prisma.sensoryFlight.create({ data: { sessionId, name: `TEST Flight (${RUN_ID})`, sequenceOrder: 1 } });
  flightId = flight.id;
  const blindSample = await prisma.sensoryBlindSample.create({ data: { flightId, blindCode: `${RUN_ID}-BC1` } });
  blindSampleId = blindSample.id;
  await prisma.sensoryBlindMapping.create({ data: { blindSampleId, sampleId, revealedAt: new Date() } });
  await prisma.panelResult.create({ data: { blindSampleId, attributeId: null, responseCount: 3, meanValue: 88, minValue: 86, maxValue: 90 } });
});

afterAll(async () => {
  await prisma.panelResult.deleteMany({ where: assertDefinedWhere({ blindSampleId }) });
  await prisma.sensoryBlindMapping.deleteMany({ where: assertDefinedWhere({ blindSampleId }) });
  await prisma.sensoryBlindSample.deleteMany({ where: assertDefinedWhere({ id: blindSampleId }) });
  await prisma.sensoryFlight.deleteMany({ where: assertDefinedWhere({ id: flightId }) });
  await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: sessionId }) });
  await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: protocolVersionId }) });
  await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: protocolId }) });
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ id: sampleId }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: greenLotId }) });
  await prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ id: storageAssignmentId }) });

  const allLotIds = [cherryLotId, dryingStageLotId, greenLotId];
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: allLotIds } }) });
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: allLotIds } } } }, { outputs: { some: { lotId: { in: allLotIds } } } }] }),
  });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: dryingRunId }) });
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: fermentationRunId }) });
  await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ resultingLotId: cherryLotId }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: allLotIds } }) });

  const userAccountIds = [operatorUserAccountId, wrongProjectUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [plotLocationId, warehouseLocationId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("Full coffee workflow — T14 end-to-end", () => {
  it("gives each lot its own independent quantity ledger, not a decrementing running total", async () => {
    // Each stage-change seeds only the *output* lot's ledger (T6/T7's own
    // documented fix) — the cherry lot's "received" event is never zeroed
    // out just because the material moved on; that transition is expressed
    // through lineage (LotTransformation), not by mutating a prior lot's
    // own quantity. This is the composition fact worth pinning here: it's
    // true by construction in every per-ticket test, but never asserted
    // across a full chain in one place until now.
    const cherryQuantity = await computeCurrentQuantity(operatorUserAccountId, cherryLotId);
    expect(cherryQuantity.quantity.toString()).toBe("500");
    expect(cherryQuantity.unit).toBe("kg");

    const dryingStageQuantity = await computeCurrentQuantity(operatorUserAccountId, dryingStageLotId);
    expect(dryingStageQuantity.quantity.toString()).toBe("480");

    // Green lot: 400 kg process_output, minus the 2 kg sample extraction.
    const greenQuantity = await computeCurrentQuantity(operatorUserAccountId, greenLotId);
    expect(greenQuantity.quantity.toString()).toBe("398");
  });

  it("walks the full lineage from the green lot back to the original harvest", async () => {
    const lineage = await getLotLineage(operatorUserAccountId, greenLotId);
    expect(lineage.ancestorLotIds).toEqual(expect.arrayContaining([cherryLotId, dryingStageLotId]));
  });

  it("reflects the current storage assignment", async () => {
    const assignment = await prisma.storageAssignment.findUniqueOrThrow({ where: { id: storageAssignmentId } });
    expect(assignment.lotId).toBe(greenLotId);
    expect(assignment.locationId).toBe(warehouseLocationId);
    expect(assignment.endedAt).toBeNull();
  });

  it("renders a complete report — origin, processing, storage, measurement, sample, and sensory result together", async () => {
    const report = await getLotReport(operatorUserAccountId, greenLotId);

    expect(report.origins.harvestEvents).toHaveLength(1);
    expect(report.fermentationRuns.map((r) => r.id)).toContain(fermentationRunId);
    expect(report.dryingRuns.map((r) => r.id)).toContain(dryingRunId);

    // The stage T13's own E2E test never reached.
    expect(report.storageAssignments.map((s) => s.id)).toContain(storageAssignmentId);

    expect(report.measurements.map((m) => m.variable)).toContain("moisture");
    expect(report.samples.map((s) => s.id)).toContain(sampleId);

    const linkage = report.sensoryLinkage[sampleId];
    expect(linkage).toHaveLength(1);
    expect(linkage![0]!.overallResult).toEqual({ meanValue: "88", minValue: "86", maxValue: "90", responseCount: 3 });
  });

  it("denies a user with no access to the project on both a read and a write path", async () => {
    await expect(getLotReport(wrongProjectUserAccountId, greenLotId)).rejects.toThrow(TraceabilityAccessError);
    await expect(
      moveLotToStorage(wrongProjectUserAccountId, {
        lotId: greenLotId,
        locationId: warehouseLocationId,
        startedAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });
});
