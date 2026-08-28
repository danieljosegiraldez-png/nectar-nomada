/**
 * P1 (docs/implementation/42_P1_LAND_FOUNDATION.md §7). Real Postgres,
 * RUN_ID-scoped fixtures, same discipline as f1.test.ts — whose location-scoped
 * Farm Operator setup this reuses, since a cohort is gated by
 * `location:manage_attributes` exactly as a Location's own attributes are.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { LocationAccessError, updateLocationAttributes } from "../../lib/traceability/locations";
import {
  createPlantingCohort,
  listPlantingCohorts,
  recordHarvestSources,
  renovatePlantingCohort,
  PlantingCohortValidationError,
} from "../../lib/traceability/plantingCohorts";
import { recordHarvestEvent } from "../../lib/traceability/harvest";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `p1-${Date.now()}`;

let organizationId: string;
let projectId: string;
let plotAId: string;
let plotBId: string;
let plotCId: string;
let otherPlotId: string;
let authorizedUserAccountId: string;
let wrongLocationUserAccountId: string;

let caturraValueId: string;
let catuaiAliasValueId: string;
let catuaiCanonicalValueId: string;
let desconocidoValueId: string;

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "en" },
  });
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return account.id;
}

async function assignFarmOperator(userAccountId: string, locationRefId: string) {
  const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationRefId } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: profile.id, scopeId: scope.id } });
}

async function plot(name: string) {
  const location = await prisma.location.create({
    data: {
      locationType: "plot",
      name: `TEST ${name} (${RUN_ID})`,
      organizationId,
      status: "approved",
      classification: "internal",
    },
  });
  return location.id;
}

async function cultivarValue(value: string) {
  const row = await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value, catalog: { key: "cultivar" } },
  });
  return row.id;
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const project = await prisma.project.create({
    data: { name: `TEST Project (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = project.id;

  plotAId = await plot("Plot A");
  plotBId = await plot("Plot B");
  plotCId = await plot("Plot C");
  otherPlotId = await plot("Other Plot");

  authorizedUserAccountId = await createTestUserAccount("P1Operator");
  for (const id of [plotAId, plotBId, plotCId]) await assignFarmOperator(authorizedUserAccountId, id);

  wrongLocationUserAccountId = await createTestUserAccount("P1WrongLocation");
  await assignFarmOperator(wrongLocationUserAccountId, otherPlotId);

  caturraValueId = await cultivarValue("Caturra");
  catuaiAliasValueId = await cultivarValue("Catuai");
  catuaiCanonicalValueId = await cultivarValue("Catuaí");
  desconocidoValueId = await cultivarValue("desconocido");
});

afterAll(async () => {
  const locationIds = [plotAId, plotBId, plotCId, otherPlotId];
  const harvestEvents = await prisma.harvestEvent.findMany({ where: { locationId: { in: locationIds } } });
  const harvestEventIds = harvestEvents.map((h) => h.id);
  const lotIds = harvestEvents.map((h) => h.resultingLotId);

  await prisma.harvestEventSource.deleteMany({ where: assertDefinedWhere({ harvestEventId: { in: harvestEventIds } }) });
  await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ id: { in: harvestEventIds } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });
  await prisma.plantingCohort.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });

  const userIds = [authorizedUserAccountId, wrongLocationUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: locationIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("PlantingCohort — partial knowledge is the normal case", () => {
  it("accepts a cohort with a cultivar and no plant count", async () => {
    const cohort = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotAId,
      cultivarValueId: caturraValueId,
      plantedAt: new Date("2019-01-01"),
      plantedPrecision: "year",
      provenanceClass: "original_record",
    });

    expect(cohort.plantCount).toBeNull();
    expect(cohort.status).toBe("active");
    // A cohort with a cultivar and no count is useful. One with an invented
    // count is worse than nothing.
    expect(cohort.cultivarValueId).toBe(caturraValueId);
  });

  it("refuses a planted date with no stated precision", async () => {
    await expect(
      createPlantingCohort(authorizedUserAccountId, {
        locationId: plotAId,
        plantedAt: new Date("2019-03-14"),
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(PlantingCohortValidationError);
  });

  it("requires dataQuality when the cultivar is recorded as unknown", async () => {
    await expect(
      createPlantingCohort(authorizedUserAccountId, {
        locationId: plotAId,
        cultivarValueId: desconocidoValueId,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(PlantingCohortValidationError);

    const withQuality = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotAId,
      cultivarValueId: desconocidoValueId,
      provenanceClass: "direct_observation",
      dataQuality: "unconfirmed",
    });
    expect(withQuality.dataQuality).toBe("unconfirmed");
  });
});

describe("cultivar aliases resolve to the canonical row", () => {
  it("stores a cohort created with 'Catuai' against the canonical 'Catuaí'", async () => {
    const cohort = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotBId,
      cultivarValueId: catuaiAliasValueId,
      provenanceClass: "original_record",
    });

    // Otherwise grouping by cultivar silently splits one plant across spellings.
    expect(cohort.cultivarValueId).toBe(catuaiCanonicalValueId);
    expect(cohort.cultivarValueId).not.toBe(catuaiAliasValueId);
  });
});

describe("a block holds several cohorts at once", () => {
  it("keeps two cultivars with different planting years side by side on one plot", async () => {
    await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotCId,
      cultivarValueId: caturraValueId,
      plantedAt: new Date("2015-01-01"),
      plantedPrecision: "year",
      plantCount: 1200,
      provenanceClass: "original_record",
    });
    await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotCId,
      cultivarValueId: catuaiCanonicalValueId,
      plantedAt: new Date("2021-01-01"),
      plantedPrecision: "year",
      plantCount: 800,
      provenanceClass: "original_record",
    });

    const cohorts = await listPlantingCohorts(authorizedUserAccountId, plotCId);
    expect(cohorts).toHaveLength(2);
    expect(cohorts.map((c) => c.plantCount)).toEqual(expect.arrayContaining([1200, 800]));
  });
});

describe("renovation is a new cohort, never an edit", () => {
  it("closes the old cohort with its original values intact and opens a new one", async () => {
    const original = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotBId,
      cultivarValueId: caturraValueId,
      plantedAt: new Date("2010-01-01"),
      plantedPrecision: "year",
      plantCount: 2000,
      provenanceClass: "original_record",
    });

    const removedAt = new Date("2027-06-01");
    const { closed, replacement } = await renovatePlantingCohort(authorizedUserAccountId, {
      cohortId: original.id,
      removedAt,
      reason: "Soca completa",
      replacement: {
        cultivarValueId: catuaiCanonicalValueId,
        plantedAt: new Date("2027-01-01"),
        plantedPrecision: "year",
        plantCount: 2100,
        provenanceClass: "original_record",
      },
    });

    expect(closed.status).toBe("renovated");
    expect(closed.removedAt).toEqual(removedAt);
    // The block was Caturra in 2010 and that stays true — a yield figure from
    // then is only interpretable against the population that produced it.
    expect(closed.cultivarValueId).toBe(caturraValueId);
    expect(closed.plantCount).toBe(2000);

    expect(replacement).not.toBeNull();
    expect(replacement!.status).toBe("active");
    expect(replacement!.cultivarValueId).toBe(catuaiCanonicalValueId);
  });

  it("refuses to renovate a cohort that is already closed", async () => {
    const cohort = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotBId,
      provenanceClass: "original_record",
    });
    await renovatePlantingCohort(authorizedUserAccountId, { cohortId: cohort.id, removedAt: new Date() });

    await expect(
      renovatePlantingCohort(authorizedUserAccountId, { cohortId: cohort.id, removedAt: new Date() }),
    ).rejects.toThrow(PlantingCohortValidationError);
  });
});

describe("Location.areaHectares", () => {
  it("records a declared block area", async () => {
    const updated = await updateLocationAttributes(authorizedUserAccountId, {
      locationId: plotAId,
      areaHectares: 1.75,
    });
    expect(Number(updated.areaHectares)).toBe(1.75);
  });
});

describe("multi-block harvest", () => {
  it("records three contributing blocks, leaves the primary plot untouched, and reports the difference", async () => {
    const { harvestEvent } = await recordHarvestEvent(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-multiblock`,
      locationId: plotAId,
      organizationId,
      projectId,
      harvestedAt: new Date(),
      cherryWeightKg: 300,
      provenanceClass: "measured_fact",
    });

    const reconciliation = await recordHarvestSources(authorizedUserAccountId, {
      harvestEventId: harvestEvent.id,
      sources: [
        { locationId: plotAId, cherryWeightKg: 150 },
        { locationId: plotBId, cherryWeightKg: 90 },
        { locationId: plotCId, cherryWeightKg: 55 },
      ],
    });

    const sources = await prisma.harvestEventSource.findMany({ where: { harvestEventId: harvestEvent.id } });
    expect(sources).toHaveLength(3);

    // The primary plot is unchanged — sources are additional contributions.
    const reloaded = await prisma.harvestEvent.findUniqueOrThrow({ where: { id: harvestEvent.id } });
    expect(reloaded.locationId).toBe(plotAId);

    // 300 declared, 295 from blocks. Reported, not rejected: nobody weighs each
    // block on a calibrated scale before tipping it into the same hopper.
    expect(reconciliation.declaredTotalKg).toBe(300);
    expect(reconciliation.sourceTotalKg).toBe(295);
    expect(reconciliation.differenceKg).toBe(5);
  });

  it("reports an unknown difference as null when no contribution was weighed", async () => {
    const { harvestEvent } = await recordHarvestEvent(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-unweighed`,
      locationId: plotAId,
      organizationId,
      projectId,
      harvestedAt: new Date(),
      cherryWeightKg: 100,
      provenanceClass: "measured_fact",
    });

    const reconciliation = await recordHarvestSources(authorizedUserAccountId, {
      harvestEventId: harvestEvent.id,
      sources: [{ locationId: plotBId }, { locationId: plotCId }],
    });

    // Unknown, not zero — ADR-080's distinction applied to intake.
    expect(reconciliation.sourceTotalKg).toBeNull();
    expect(reconciliation.differenceKg).toBeNull();
  });
});

describe("RBAC", () => {
  it("denies an operator scoped to a different location", async () => {
    await expect(
      createPlantingCohort(wrongLocationUserAccountId, {
        locationId: plotAId,
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("denies recording sources for a block the operator cannot manage", async () => {
    const { harvestEvent } = await recordHarvestEvent(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-rbac`,
      locationId: plotAId,
      organizationId,
      projectId,
      harvestedAt: new Date(),
      provenanceClass: "measured_fact",
    });

    await expect(
      recordHarvestSources(authorizedUserAccountId, {
        harvestEventId: harvestEvent.id,
        // otherPlotId is outside this operator's scope, even though the
        // harvest's own primary plot is inside it.
        sources: [{ locationId: otherPlotId, cherryWeightKg: 10 }],
      }),
    ).rejects.toThrow(LocationAccessError);
  });
});

describe("pre-existing land records stay valid", () => {
  it("leaves PlantingEvent.plantingCohortId nullable — the one real row predates cohorts", async () => {
    const orphans = await prisma.plantingEvent.count({ where: { plantingCohortId: null } });
    // Never backfilled with a guess; a NULL here is correct history.
    expect(orphans).toBeGreaterThanOrEqual(1);
  });
});
