/**
 * S1 (docs/implementation/32_S1_CAFES_EXTERNOS.md). Real Postgres (Neon),
 * no mocks — same discipline as every Traceability test suite. Covers §9's
 * six verification scenarios: minimal external coffee reaching a score,
 * producer/processor/brand kept separately consultable, declared-not-
 * observed provenance, per-field dataQuality reflecting an incomplete
 * chain, completing a record later with correct per-fact knownAt
 * timestamps, and A7/F1 real data left untouched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import {
  completeExternalCoffeeOrigin,
  recordExternalCoffeeSample,
  SampleValidationError,
} from "../../lib/traceability/samples";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `s1-${Date.now()}`;

let organizationId: string;

let producerOrgId: string;
let processorOrgId: string;
let brandOrgId: string;
let otherOrgId: string;
let projectId: string;
let otherProjectId: string;

let authorizedUserAccountId: string;
let wrongProjectUserAccountId: string;

const sampleIds: string[] = [];
let protocolId: string;
let protocolVersionId: string;
let sessionId: string;

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
  organizationId = await createTestOrganization(RUN_ID);
  const producer = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Producer Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  producerOrgId = producer.id;
  const processor = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Processor Beneficio (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  processorOrgId = processor.id;
  const brand = await prisma.organization.create({
    data: { organizationType: "nectar_nomada_partner", name: `TEST Brand (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  brandOrgId = brand.id;
  const other = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Unrelated Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  otherOrgId = other.id;

  const project = await prisma.project.create({ data: { name: `TEST S1 Project (${RUN_ID})`, status: "approved", classification: "internal" } });
  projectId = project.id;
  const otherProject = await prisma.project.create({ data: { name: `TEST S1 Other Project (${RUN_ID})`, status: "approved", classification: "internal" } });
  otherProjectId = otherProject.id;

  authorizedUserAccountId = await createTestUserAccount("S1Operator");
  await assignFarmOperator(authorizedUserAccountId, projectId);
  wrongProjectUserAccountId = await createTestUserAccount("S1WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, otherProjectId);

  const protocol = await prisma.sensoryProtocol.create({ data: { domain: "coffee", name: `TEST S1 Protocol (${RUN_ID})`, status: "active" } });
  protocolId = protocol.id;
  const protocolVersion = await prisma.sensoryProtocolVersion.create({
    data: { protocolId, version: 1, scoreMin: 0, scoreMax: 100, status: "active" },
  });
  protocolVersionId = protocolVersion.id;
  const session = await prisma.sensorySession.create({
    data: { name: `TEST S1 Session (${RUN_ID})`, protocolVersionId, status: "completed", classification: "internal" },
  });
  sessionId = session.id;
});

afterAll(async () => {
  await prisma.panelResult.deleteMany({ where: assertDefinedWhere({ blindSample: { flight: { sessionId } } }) });
  await prisma.sensoryBlindMapping.deleteMany({ where: assertDefinedWhere({ sampleId: { in: sampleIds } }) });
  await prisma.sensoryBlindSample.deleteMany({ where: assertDefinedWhere({ flight: { sessionId } }) });
  await prisma.sensoryFlight.deleteMany({ where: assertDefinedWhere({ sessionId }) });
  await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: sessionId }) });
  await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: protocolVersionId }) });
  await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: protocolId }) });

  await prisma.externalCoffeeOrigin.deleteMany({ where: assertDefinedWhere({ sampleId: { in: sampleIds } }) });
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ id: { in: sampleIds } }) });

  const userAccountIds = [authorizedUserAccountId, wrongProjectUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [projectId, otherProjectId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectId, otherProjectId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: [producerOrgId, processorOrgId, brandOrgId, otherOrgId] } }) });
  await deleteTestOrganizations(RUN_ID);
});

describe("recordExternalCoffeeSample — validation", () => {
  it("rejects a user with no access to the given project", async () => {
    await expect(
      recordExternalCoffeeSample(wrongProjectUserAccountId, {
        sampleCode: `${RUN_ID}-reject-access`,
        sampleType: "green_coffee",
        projectId,
        producerOrganizationId: producerOrgId,
        declaredProvenanceClass: "manufacturer_specification",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("rejects when no organization identifies the coffee at all", async () => {
    await expect(
      recordExternalCoffeeSample(authorizedUserAccountId, {
        sampleCode: `${RUN_ID}-reject-no-org`,
        sampleType: "green_coffee",
        projectId,
        declaredProvenanceClass: "manufacturer_specification",
      }),
    ).rejects.toThrow(SampleValidationError);
  });

  it("rejects a declared varietal with no dataQuality", async () => {
    await expect(
      recordExternalCoffeeSample(authorizedUserAccountId, {
        sampleCode: `${RUN_ID}-reject-varietal-dq`,
        sampleType: "green_coffee",
        projectId,
        producerOrganizationId: producerOrgId,
        declaredVarietal: "Geisha",
        declaredProvenanceClass: "manufacturer_specification",
      }),
    ).rejects.toThrow(SampleValidationError);
  });

  it("rejects a harvest month without a precision of month or date", async () => {
    await expect(
      recordExternalCoffeeSample(authorizedUserAccountId, {
        sampleCode: `${RUN_ID}-reject-window-shape`,
        sampleType: "green_coffee",
        projectId,
        producerOrganizationId: producerOrgId,
        harvestWindowPrecision: "year",
        harvestYear: 2025,
        harvestMonth: 11,
        harvestWindowDataQuality: "unconfirmed",
        declaredProvenanceClass: "manufacturer_specification",
      }),
    ).rejects.toThrow(SampleValidationError);
  });

  it("rejects an out-of-range harvest month", async () => {
    await expect(
      recordExternalCoffeeSample(authorizedUserAccountId, {
        sampleCode: `${RUN_ID}-reject-month-range`,
        sampleType: "green_coffee",
        projectId,
        producerOrganizationId: producerOrgId,
        harvestWindowPrecision: "month",
        harvestYear: 2025,
        harvestMonth: 13,
        harvestWindowDataQuality: "unconfirmed",
        declaredProvenanceClass: "manufacturer_specification",
      }),
    ).rejects.toThrow(SampleValidationError);
  });
});

describe("§9.1 — minimal external coffee: farm, varietal, process, year, reaches a score", () => {
  it("records with only producer + varietal + process + year, and the sample flows into a real cupping score", async () => {
    const { sample, origin } = await recordExternalCoffeeSample(authorizedUserAccountId, {
      sampleCode: `${RUN_ID}-minimal`,
      sampleType: "green_coffee",
      projectId,
      producerOrganizationId: producerOrgId,
      declaredVarietal: "Caturra",
      varietalDataQuality: "unconfirmed",
      declaredProcess: "washed",
      processDataQuality: "provisional",
      harvestWindowPrecision: "year",
      harvestYear: 2025,
      harvestWindowDataQuality: "provisional",
      declaredProvenanceClass: "manufacturer_specification",
      sourceReference: "TEST — cliente trajo el café a mano",
    });
    sampleIds.push(sample.id);

    expect(sample.sourceLotId).toBeNull();
    expect(origin.producerOrganizationId).toBe(producerOrgId);
    expect(origin.declaredVarietal).toBe("Caturra");
    expect(origin.harvestWindowPrecision).toBe("year");
    expect(origin.harvestYear).toBe(2025);
    expect(origin.harvestMonth).toBeNull();
    expect(origin.harvestDay).toBeNull();

    // The golden-path claim: this Sample is usable in the sensory pipeline
    // exactly like any Lot-sourced sample — real SensoryFlight/BlindSample/
    // BlindMapping/PanelResult, no special-casing needed anywhere upstream.
    const flight = await prisma.sensoryFlight.create({ data: { sessionId, name: `TEST S1 Flight (${RUN_ID})`, sequenceOrder: 1 } });
    const blindSample = await prisma.sensoryBlindSample.create({ data: { flightId: flight.id, blindCode: `${RUN_ID}-BC1` } });
    await prisma.sensoryBlindMapping.create({ data: { blindSampleId: blindSample.id, sampleId: sample.id, revealedAt: new Date() } });
    const panelResult = await prisma.panelResult.create({
      data: { blindSampleId: blindSample.id, attributeId: null, responseCount: 1, meanValue: 87, minValue: 87, maxValue: 87 },
    });

    expect(panelResult.meanValue.toString()).toBe("87");
  });
});

describe("§9.2 — producer, processor, brand as three distinct, separately consultable organizations", () => {
  it("records the Agustín/Cafelino/Néctar Nómada shape and each organization is independently queryable", async () => {
    const { sample, origin } = await recordExternalCoffeeSample(authorizedUserAccountId, {
      sampleCode: `${RUN_ID}-three-orgs`,
      sampleType: "green_coffee",
      projectId,
      producerOrganizationId: producerOrgId,
      processorOrganizationId: processorOrgId,
      brandOrganizationId: brandOrgId,
      declaredVarietal: "Geisha",
      varietalDataQuality: "unconfirmed",
      declaredProvenanceClass: "manufacturer_specification",
    });
    sampleIds.push(sample.id);

    expect(origin.producerOrganizationId).toBe(producerOrgId);
    expect(origin.processorOrganizationId).toBe(processorOrgId);
    expect(origin.brandOrganizationId).toBe(brandOrgId);
    expect(origin.producerOrganizationId).not.toBe(origin.processorOrganizationId);
    expect(origin.processorOrganizationId).not.toBe(origin.brandOrganizationId);

    const asProducer = await prisma.externalCoffeeOrigin.findMany({ where: { producerOrganizationId: producerOrgId } });
    const asProcessor = await prisma.externalCoffeeOrigin.findMany({ where: { processorOrganizationId: processorOrgId } });
    const asBrand = await prisma.externalCoffeeOrigin.findMany({ where: { brandOrganizationId: brandOrgId } });
    expect(asProducer.some((o) => o.sampleId === sample.id)).toBe(true);
    expect(asProcessor.some((o) => o.sampleId === sample.id)).toBe(true);
    expect(asBrand.some((o) => o.sampleId === sample.id)).toBe(true);

    // An unrelated org never resolves this sample via any of the three roles.
    const asUnrelatedProducer = await prisma.externalCoffeeOrigin.findMany({ where: { producerOrganizationId: otherOrgId } });
    expect(asUnrelatedProducer.some((o) => o.sampleId === sample.id)).toBe(false);
  });
});

describe("§9.3 — provenance reflects declared, not observed", () => {
  it("stores the caller's chosen declared-info provenanceClass (manufacturer_specification), never silently upgraded to direct_observation or measured_fact", async () => {
    const { sample, origin } = await recordExternalCoffeeSample(authorizedUserAccountId, {
      sampleCode: `${RUN_ID}-provenance`,
      sampleType: "green_coffee",
      projectId,
      producerOrganizationId: producerOrgId,
      declaredProvenanceClass: "manufacturer_specification",
      sourceReference: "TEST — WhatsApp del productor, 2026-08-10",
    });
    sampleIds.push(sample.id);

    expect(origin.declaredProvenanceClass).toBe("manufacturer_specification");
    expect(origin.declaredProvenanceClass).not.toBe("direct_observation");
    expect(origin.declaredProvenanceClass).not.toBe("measured_fact");
    expect(origin.sourceReference).toContain("WhatsApp");
  });

  it("also accepts interpretation, per §2's second allowed class", async () => {
    const { sample, origin } = await recordExternalCoffeeSample(authorizedUserAccountId, {
      sampleCode: `${RUN_ID}-provenance-interp`,
      sampleType: "green_coffee",
      projectId,
      producerOrganizationId: producerOrgId,
      declaredProvenanceClass: "interpretation",
    });
    sampleIds.push(sample.id);
    expect(origin.declaredProvenanceClass).toBe("interpretation");
  });
});

describe("§9.4 — dataQuality reflects an incomplete chain", () => {
  it("lets varietal and process carry independently different dataQuality, matching their differing real-world reliability", async () => {
    const { sample, origin } = await recordExternalCoffeeSample(authorizedUserAccountId, {
      sampleCode: `${RUN_ID}-dataquality-split`,
      sampleType: "green_coffee",
      projectId,
      producerOrganizationId: producerOrgId,
      declaredVarietal: "Typica",
      varietalDataQuality: "unconfirmed", // "el varietal es lo que más frecuentemente viene mal"
      declaredProcess: "honey",
      processDataQuality: "provisional", // "el proceso a veces lo declara quien vende"
      declaredProvenanceClass: "manufacturer_specification",
    });
    sampleIds.push(sample.id);

    expect(origin.varietalDataQuality).toBe("unconfirmed");
    expect(origin.processDataQuality).toBe("provisional");
    expect(origin.varietalDataQuality).not.toBe(origin.processDataQuality);
    // Structural incompleteness marker: no Lot backs this record at all.
    expect(sample.sourceLotId).toBeNull();
  });
});

describe("§9.5 — completing a record later reflects when each fact was actually learned", () => {
  it("stamps a newly-completed field's own knownAt to now, leaving an untouched field's knownAt alone", async () => {
    const { sample, origin: created } = await recordExternalCoffeeSample(authorizedUserAccountId, {
      sampleCode: `${RUN_ID}-complete-later`,
      sampleType: "green_coffee",
      projectId,
      producerOrganizationId: producerOrgId,
      declaredVarietal: "Bourbon",
      varietalDataQuality: "unconfirmed",
      declaredProvenanceClass: "manufacturer_specification",
    });
    sampleIds.push(sample.id);

    expect(created.varietalKnownAt).not.toBeNull();
    expect(created.processKnownAt).toBeNull();
    expect(created.harvestWindowKnownAt).toBeNull();

    const completed = await completeExternalCoffeeOrigin(authorizedUserAccountId, {
      sampleId: sample.id,
      declaredProcess: "natural",
      processDataQuality: "verified",
      sourceReference: "TEST — factura del procesador llegó después",
    });

    expect(completed.declaredProcess).toBe("natural");
    expect(completed.processKnownAt).not.toBeNull();
    // The varietal's own knownAt is untouched by completing a different field.
    expect(completed.varietalKnownAt?.getTime()).toBe(created.varietalKnownAt?.getTime());
    expect(completed.processKnownAt?.getTime()).not.toBe(created.varietalKnownAt?.getTime());
  });

  it("rejects a user with no access when completing", async () => {
    const { sample } = await recordExternalCoffeeSample(authorizedUserAccountId, {
      sampleCode: `${RUN_ID}-complete-access`,
      sampleType: "green_coffee",
      projectId,
      producerOrganizationId: producerOrgId,
      declaredProvenanceClass: "manufacturer_specification",
    });
    sampleIds.push(sample.id);

    await expect(
      completeExternalCoffeeOrigin(wrongProjectUserAccountId, { sampleId: sample.id, declaredProcess: "washed", processDataQuality: "provisional" }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("links the real Lot once traced, without clearing the declared origin history (§6's own named example)", async () => {
    const { sample } = await recordExternalCoffeeSample(authorizedUserAccountId, {
      sampleCode: `${RUN_ID}-complete-link-lot`,
      sampleType: "green_coffee",
      projectId,
      producerOrganizationId: producerOrgId,
      declaredVarietal: "Catuai",
      varietalDataQuality: "unconfirmed",
      declaredProvenanceClass: "manufacturer_specification",
    });
    sampleIds.push(sample.id);

    const lot = await prisma.lot.create({ data: { lotCode: `${RUN_ID}-linked-lot`, lotType: "green", organizationId, projectId, createdBy: authorizedUserAccountId } });

    const completed = await completeExternalCoffeeOrigin(authorizedUserAccountId, { sampleId: sample.id, linkToLotId: lot.id });

    const updatedSample = await prisma.sample.findUniqueOrThrow({ where: { id: sample.id } });
    expect(updatedSample.sourceLotId).toBe(lot.id);
    // The declared-origin row survives — how the record started stays true history.
    expect(completed.declaredVarietal).toBe("Catuai");

    await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: lot.id } ) });
  });
});

describe("§9.6 — A7 and F1 real data left untouched", () => {
  it("Cerro Azul real data and F1 tables are unaffected by S1's writes", async () => {
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

    const testResidue = await prisma.externalCoffeeOrigin.findMany({
      where: { sample: { sampleCode: { contains: RUN_ID } } },
      select: { sampleId: true },
    });
    expect(testResidue.length).toBe(sampleIds.length);
  });
});
