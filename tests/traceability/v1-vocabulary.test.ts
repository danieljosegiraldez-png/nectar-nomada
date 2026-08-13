/**
 * docs/implementation/38_V1_VOCABULARIO_LOTE_BATCH.md — §6 verification.
 *
 * This ticket is a UI/i18n relabel (terrain "Lote"/"Plot" vs. harvested-
 * coffee "Batch"/`Lot`), not a schema change, so most of §6 (points 1/2:
 * walking the app in each language) isn't unit-testable. What *is*
 * testable, and is exactly the part of the ticket that's more than a
 * label — §2's "el vínculo se registra siempre" — is:
 *
 *   3. Harvest already structurally requires stating which terrain plot a
 *      batch came from (`RecordHarvestEventInput.locationId: string`, not
 *      nullable) — this test proves that's enforced at the data layer, not
 *      just the TypeScript type (which a caller could bypass at runtime).
 *   4/5. getLotDetail/getLotReport's `lot.location` (the batch's origin
 *      plot) carries F1's terrain-condition fields, which is what the new
 *      "origin plot" sections on the batch detail page and report render.
 *
 * Same real-Postgres, RUN_ID-scoped-fixture, thorough-cleanup discipline as
 * tests/traceability/harvest.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { recordHarvestEvent, type RecordHarvestEventInput } from "../../lib/traceability/harvest";
import { getManageableContext, getLotDetail } from "../../lib/traceability/lots";
import { getLotReport } from "../../lib/traceability/reports";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `v1-${Date.now()}`;

let farmOrganizationId: string;
let projectId: string;
let plotLocationId: string;
let operatorUserAccountId: string;

beforeAll(async () => {
  const farmOrganization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  farmOrganizationId = farmOrganization.id;

  const site = await prisma.location.create({
    data: { locationType: "site", name: `TEST Farm Site (${RUN_ID})`, organizationId: farmOrganizationId, status: "approved", classification: "internal" },
  });

  // F1 terrain conditions (sun/shade/altitude/slope/soil) — exactly what
  // the batch detail page and report are supposed to surface for a batch's
  // origin plot.
  const plot = await prisma.location.create({
    data: {
      locationType: "plot",
      name: `TEST Plot 1 (${RUN_ID})`,
      organizationId: farmOrganizationId,
      parentLocationId: site.id,
      status: "approved",
      classification: "internal",
      sunExposure: "morning",
      shadePercentage: "pct_30",
      altitudeMinM: 1300,
      altitudeMaxM: 1450,
      slopeDescription: "steep, terraced",
      soilType: "volcanic loam",
    },
  });
  plotLocationId = plot.id;

  const project = await prisma.project.create({
    data: { name: `TEST Project (${RUN_ID})`, organizationId: farmOrganizationId, status: "approved", classification: "internal" },
  });
  projectId = project.id;

  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Operator", displayName: `TEST Operator (${RUN_ID})`, locale: "en" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  operatorUserAccountId = userAccount.id;

  const farmOperatorProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scopeRow = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
  await prisma.assignment.create({
    data: { userAccountId: operatorUserAccountId, roleProfileId: farmOperatorProfile.id, scopeId: scopeRow.id },
  });
});

afterAll(async () => {
  const testLots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = testLots.map((l) => l.id);

  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ resultingLotId: { in: lotIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });

  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: operatorUserAccountId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: operatorUserAccountId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ organizationId: farmOrganizationId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: farmOrganizationId }) });
});

describe("V1 §6.3 — recording a harvest requires stating which terrain plot the batch came from", () => {
  it("succeeds when locationId names a real plot", async () => {
    const { lot } = await recordHarvestEvent(operatorUserAccountId, {
      provenanceClass: "measured_fact",
      lotCode: `${RUN_ID}-harvest-with-plot`,
      locationId: plotLocationId,
      organizationId: farmOrganizationId,
      projectId,
      harvestedAt: new Date(),
      cherryWeightKg: 200,
    });
    expect(lot.locationId).toBe(plotLocationId);
  });

  it("is rejected at the data layer when a caller bypasses the TypeScript type and omits locationId", async () => {
    const { locationId: _omitted, ...withoutLocation } = {
      provenanceClass: "measured_fact" as const,
      lotCode: `${RUN_ID}-harvest-no-plot`,
      locationId: plotLocationId,
      organizationId: farmOrganizationId,
      projectId,
      harvestedAt: new Date(),
    };
    await expect(
      recordHarvestEvent(operatorUserAccountId, withoutLocation as unknown as RecordHarvestEventInput),
    ).rejects.toThrow();

    const created = await prisma.lot.findFirst({ where: { lotCode: `${RUN_ID}-harvest-no-plot` } });
    expect(created).toBeNull();
  });
});

describe("V1 §6.4/§6.5 — a batch's origin plot carries F1's terrain conditions", () => {
  it("getManageableContext's plotLocations exposes the plot's F1 attributes", async () => {
    const { plotLocations } = await getManageableContext(operatorUserAccountId);
    const testPlot = plotLocations.find((l) => l.id === plotLocationId);
    expect(testPlot).toBeDefined();
    expect(testPlot?.sunExposure).toBe("morning");
    expect(testPlot?.shadePercentage).toBe("pct_30");
    expect(testPlot?.altitudeMinM).toBe(1300);
    expect(testPlot?.altitudeMaxM).toBe(1450);
    expect(testPlot?.slopeDescription).toBe("steep, terraced");
    expect(testPlot?.soilType).toBe("volcanic loam");
  });

  it("getLotDetail's lot.location (the batch's origin plot) carries F1's terrain conditions", async () => {
    const { lot } = await recordHarvestEvent(operatorUserAccountId, {
      provenanceClass: "measured_fact",
      lotCode: `${RUN_ID}-harvest-detail`,
      locationId: plotLocationId,
      organizationId: farmOrganizationId,
      projectId,
      harvestedAt: new Date(),
      cherryWeightKg: 100,
    });

    const detail = await getLotDetail(operatorUserAccountId, lot.id);
    expect(detail.lot.location?.id).toBe(plotLocationId);
    expect(detail.lot.location?.sunExposure).toBe("morning");
    expect(detail.lot.location?.altitudeMinM).toBe(1300);
    expect(detail.lot.location?.altitudeMaxM).toBe(1450);
  });

  it("getLotReport's lot.location (rendered alongside the batch's results) carries F1's terrain conditions", async () => {
    const { lot } = await recordHarvestEvent(operatorUserAccountId, {
      provenanceClass: "measured_fact",
      lotCode: `${RUN_ID}-harvest-report`,
      locationId: plotLocationId,
      organizationId: farmOrganizationId,
      projectId,
      harvestedAt: new Date(),
      cherryWeightKg: 100,
    });

    const report = await getLotReport(operatorUserAccountId, lot.id);
    expect(report.lot.location?.id).toBe(plotLocationId);
    expect(report.lot.location?.shadePercentage).toBe("pct_30");
    expect(report.lot.location?.soilType).toBe("volcanic loam");
    expect(report.origins.harvestEvents[0]?.location.id).toBe(plotLocationId);
  });
});
