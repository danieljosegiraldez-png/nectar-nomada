/**
 * T13 (§31 END-TO-END). Builds one full coffee workflow — harvest →
 * fermentation → drying → sample → sensory result, plus a measurement and
 * a photo — against real Neon, then asserts the Lot Report renders every
 * section correctly and reproduces identically on a second call (this
 * ticket has no schema, so "reproduces from live data" means "computed
 * fresh from unchanged data twice gives the same content," not that a
 * historical snapshot survives a later correction — that's the deferred
 * `reporting.report_version` concern, COMMERCE_OPERATIONS_TOOLS_
 * ARCHITECTURE.md §N, not built here).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, TraceabilityAccessError } from "../../lib/traceability/lots";
import { recordHarvestEvent } from "../../lib/traceability/harvest";
import { startFermentationRun, endFermentationRun } from "../../lib/traceability/fermentation";
import { startDryingRun, endDryingRun } from "../../lib/traceability/drying";
import { createSampleFromLot } from "../../lib/traceability/samples";
import { recordMeasurement } from "../../lib/traceability/measurements";
import { getLotReport } from "../../lib/traceability/reports";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `t13-report-${Date.now()}`;


let organizationId: string;
let projectId: string;
// El SEGUNDO proyecto también recibe un Scope en `assignFarmOperator`, y su id
// vivía sólo dentro de `beforeAll`: la limpieza borraba el Scope del primero y
// dejaba el del otro, uno por corrida. Medido el 2026-09-11 aislando este
// archivo: +1 huérfano, y la prueba en verde.
let otherProjectId: string;
let locationId: string;
let authorizedUserAccountId: string;
let wrongProjectUserAccountId: string;

let harvestLotId: string;
let dryingLotId: string;
let greenLotId: string;
let fermentationRunId: string;
let dryingRunId: string;
let sampleId: string;
let blindSampleId: string;
let assetId: string;

// Sensory fixtures (mirrors the "T12 boundary" pattern in lots.test.ts).
let protocolId: string;
let protocolVersionId: string;
let sessionId: string;
let flightId: string;

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

  const location = await prisma.location.create({
    // Una parcela, no un sitio: desde el 2026-09-18 `recordHarvestEvent` rechaza cosechar sobre
    // cualquier cosa que no sea `plot` (spec fincas y parcelas §3.4). El nombre ya decía «Plot».
    data: { locationType: "plot", name: `TEST Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = location.id;

  authorizedUserAccountId = await createTestUserAccount("ReportOperator");
  await assignFarmOperator(authorizedUserAccountId, projectId);

  const otherProject = await prisma.project.create({ data: { name: `TEST Other Project (${RUN_ID})`, status: "approved", classification: "internal" } });
  otherProjectId = otherProject.id;
  wrongProjectUserAccountId = await createTestUserAccount("WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, otherProject.id);

  // --- Harvest ---
  const { lot: harvestLot } = await recordHarvestEvent(authorizedUserAccountId, {
    lotCode: `${RUN_ID}-cherry`,
    locationId,
    organizationId,
    projectId,
    harvestedAt: new Date("2027-01-15T08:00:00Z"),
    cherryWeightKg: 500,
    brix: 22,
    provenanceClass: "measured_fact",
  });
  harvestLotId = harvestLot.id;

  // --- Measurement on the harvest lot ---
  await recordMeasurement(authorizedUserAccountId, {
    variable: "temperature",
    value: 24.5,
    unit: "C",
    occurredAt: new Date("2027-01-15T09:00:00Z"),
    lotId: harvestLotId,
    provenanceClass: "measured_fact",
  });

  // --- Fermentation: harvestLot -> dryingLot ---
  const { run: fermentationRun } = await startFermentationRun(authorizedUserAccountId, {
    lotId: harvestLotId,
    startedAt: new Date("2027-01-15T10:00:00Z"),
    quantity: 500,
    unit: "kg",
    provenanceClass: "original_record",
  });
  fermentationRunId = fermentationRun.id;

  const { outputLot: fermentationOutputLot } = await endFermentationRun(authorizedUserAccountId, {
    fermentationRunId,
    endedAt: new Date("2027-01-17T10:00:00Z"),
    outputLotCode: `${RUN_ID}-drying`,
    outputLotType: "drying",
    quantity: 480,
    unit: "kg",
    provenanceClass: "original_record",
  });
  dryingLotId = fermentationOutputLot.id;

  // --- Drying: dryingLot -> greenLot ---
  const { run: dryingRun } = await startDryingRun(authorizedUserAccountId, {
    lotId: dryingLotId,
    startedAt: new Date("2027-01-17T11:00:00Z"),
    quantity: 480,
    unit: "kg",
    provenanceClass: "original_record",
  });
  dryingRunId = dryingRun.id;

  const { outputLot: dryingOutputLot } = await endDryingRun(authorizedUserAccountId, {
    dryingRunId,
    endedAt: new Date("2027-01-30T11:00:00Z"),
    outputLotCode: `${RUN_ID}-green`,
    outputLotType: "green",
    quantity: 400,
    unit: "kg",
    provenanceClass: "original_record",
  });
  greenLotId = dryingOutputLot.id;

  // --- Sample from the green lot ---
  const sample = await createSampleFromLot(authorizedUserAccountId, {
    sampleCode: `${RUN_ID}-sample`,
    sampleType: "green_coffee",
    sourceLotId: greenLotId,
    occurredAt: new Date("2027-01-31T09:00:00Z"),
    provenanceClass: "original_record",
  });
  sampleId = sample.sample.id;

  // --- Sensory: blind mapping + PanelResult ---
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
  await prisma.panelResult.create({ data: { blindSampleId, attributeId: null, responseCount: 4, meanValue: 87, minValue: 85, maxValue: 89 } });

  // --- Photo (Asset row, no real R2 object — storageKey is enough for the report query) ---
  const uploader = await prisma.userAccount.findUniqueOrThrow({ where: { id: authorizedUserAccountId }, select: { personId: true } });
  const asset = await prisma.asset.create({
    data: {
      assetType: "photo",
      storageKey: `nectar-originals/traceability/${greenLotId}/${RUN_ID}-photo.jpg`,
      storageBucket: "nectar-originals",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      originalFilename: `${RUN_ID}-photo.jpg`,
      creatorPersonId: uploader.personId,
      status: "approved",
      classification: "internal",
      createdBy: authorizedUserAccountId,
      provenanceClass: "direct_observation",
      lotId: greenLotId,
    },
  });
  assetId = asset.id;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: assertDefinedWhere({ id: assetId }) });
  await prisma.panelResult.deleteMany({ where: assertDefinedWhere({ blindSampleId }) });
  await prisma.sensoryBlindMapping.deleteMany({ where: assertDefinedWhere({ blindSampleId }) });
  await prisma.sensoryBlindSample.deleteMany({ where: assertDefinedWhere({ id: blindSampleId }) });
  await prisma.sensoryFlight.deleteMany({ where: assertDefinedWhere({ id: flightId }) });
  await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: sessionId }) });
  await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: protocolVersionId }) });
  await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: protocolId }) });
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ id: sampleId }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: harvestLotId }) });

  const allLotIds = [harvestLotId, dryingLotId, greenLotId];
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: allLotIds } }) });
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: allLotIds } } } }, { outputs: { some: { lotId: { in: allLotIds } } } }] }),
  });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: dryingRunId }) });
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: fermentationRunId }) });
  await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ resultingLotId: harvestLotId }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: allLotIds } }) });

  const userAccountIds = [authorizedUserAccountId, wrongProjectUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [projectId, otherProjectId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("getLotReport — E2E, full coffee workflow", () => {
  it("renders origin, tracing back through fermentation and drying to the original harvest", async () => {
    const report = await getLotReport(authorizedUserAccountId, greenLotId);
    expect(report.origins.harvestEvents).toHaveLength(1);
    expect(report.origins.harvestEvents[0]!.organization.name).toBe(`TEST Farm (${RUN_ID})`);
    expect(report.origins.harvestEvents[0]!.location.name).toBe(`TEST Plot (${RUN_ID})`);
    expect(report.origins.receivingEvents).toHaveLength(0);
  });

  it("renders lineage with human-readable lot codes, not bare UUIDs", async () => {
    const report = await getLotReport(authorizedUserAccountId, greenLotId);
    const ancestorCodes = report.ancestorLots.map((l) => l.lotCode);
    expect(ancestorCodes).toEqual(expect.arrayContaining([`${RUN_ID}-cherry`, `${RUN_ID}-drying`]));
    expect(report.descendantLots).toHaveLength(0);
  });

  it("renders processing (fermentation + drying), measurements, samples, sensory, and photos", async () => {
    const report = await getLotReport(authorizedUserAccountId, greenLotId);

    // Processing and Measurements both look backward across the full
    // lineage (self + ancestors) — the fermentation stage-change named
    // the cherry lot as input, the drying stage-change named the drying
    // lot, and the temperature reading was recorded against the harvest
    // lot, but the green lot's own report must still show all three: a
    // client report that omitted them because they don't literally name
    // the green lot's row would misrepresent this material's history.
    expect(report.fermentationRuns.map((r) => r.id)).toContain(fermentationRunId);
    expect(report.dryingRuns.map((r) => r.id)).toContain(dryingRunId);
    expect(report.measurements).toHaveLength(1);
    expect(report.measurements[0]!.variable).toBe("temperature");

    expect(report.samples.map((s) => s.id)).toContain(sampleId);

    const linkage = report.sensoryLinkage[sampleId];
    expect(linkage).toHaveLength(1);
    expect(linkage![0]!.overallResult).toEqual({ meanValue: "87", minValue: "85", maxValue: "89", responseCount: 4 });

    expect(report.assets.map((a) => a.id)).toContain(assetId);
  });

  it("denies a user with no access to the lot's project", async () => {
    await expect(getLotReport(wrongProjectUserAccountId, greenLotId)).rejects.toThrow(TraceabilityAccessError);
  });

  it("reproduces identically on a second call against unchanged data", async () => {
    const first = await getLotReport(authorizedUserAccountId, greenLotId);
    const second = await getLotReport(authorizedUserAccountId, greenLotId);

    // generatedAt is a fresh timestamp per call by design (no version
    // table exists to pin it to) — everything else must match exactly.
    const strip = (r: typeof first) => ({ ...r, generatedAt: undefined });
    expect(strip(second)).toEqual(strip(first));
  });

  it("renders no Origin/Sensory content for a lot with neither, without erroring (a bare lot created directly)", async () => {
    const bareLot = await createLot(authorizedUserAccountId, { lotCode: `${RUN_ID}-bare`, lotType: "other", organizationId, projectId });
    try {
      const report = await getLotReport(authorizedUserAccountId, bareLot.id);
      expect(report.origins.harvestEvents).toHaveLength(0);
      expect(report.origins.receivingEvents).toHaveLength(0);
      expect(Object.keys(report.sensoryLinkage)).toHaveLength(0);
    } finally {
      await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: bareLot.id }) });
    }
  });
});
