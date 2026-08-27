/**
 * P0 (docs/implementation/41_P0_MASS_BALANCE.md §9). Real Postgres, no mocks,
 * RUN_ID-scoped fixtures — same discipline as harvest.test.ts.
 *
 * The absence of this file is why the bug survived. `quantity.test.ts` proved
 * `computeCurrentQuantity` sums a hand-written event list correctly, and it
 * did; nothing anywhere asserted that a *transformation* leaves the ledger
 * consistent, so the missing half of every write path went unnoticed through
 * fourteen tickets.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, recordTransformation, TraceabilityAccessError } from "../../lib/traceability/lots";
import { computeCurrentQuantity, recordQuantityEvent } from "../../lib/traceability/quantity";
import { startFermentationRun, endFermentationRun } from "../../lib/traceability/fermentation";
import { MassBalanceError, movesMaterial, conservesMass } from "../../lib/traceability/balance";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `p0-${Date.now()}`;

let organizationId: string;
let otherOrganizationId: string;
let projectId: string;
let locationId: string;
let operatorUserAccountId: string; // Farm Operator — no override permission
let adminUserAccountId: string; // Platform Admin — holds lot:override_balance

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "en" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

async function assign(userAccountId: string, profileName: string, scope: { scopeType: "project" | "platform"; scopeRefId: string | null }) {
  const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: profileName } });
  // Platform scope carries a NULL scopeRefId, which a compound unique cannot
  // be keyed on — findFirst-then-create rather than upsert. The platform Scope
  // row is also shared platform-wide, so it is reused, never created twice and
  // never deleted in this suite's cleanup.
  const scopeRow =
    (await prisma.scope.findFirst({ where: { scopeType: scope.scopeType, scopeRefId: scope.scopeRefId } })) ??
    (await prisma.scope.create({ data: { scopeType: scope.scopeType, scopeRefId: scope.scopeRefId } }));
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: profile.id, scopeId: scopeRow.id } });
}

/** A lot with a seeded `received` ledger, which is what most of these tests need. */
async function lotWithQuantity(code: string, kg: number | null) {
  const lot = await createLot(operatorUserAccountId, {
    lotCode: `${RUN_ID}-${code}`,
    lotType: "cherry",
    organizationId,
    projectId,
    locationId,
  });
  if (kg != null) {
    await recordQuantityEvent(operatorUserAccountId, {
      lotId: lot.id,
      eventType: "received",
      quantity: kg,
      unit: "kg",
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });
  }
  return lot;
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Org (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const otherOrganization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Other Org (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  otherOrganizationId = otherOrganization.id;

  const project = await prisma.project.create({
    data: { name: `TEST Project (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = project.id;

  const location = await prisma.location.create({
    data: { locationType: "site", name: `TEST Site (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = location.id;

  operatorUserAccountId = await createTestUserAccount("Operator");
  await assign(operatorUserAccountId, "Farm Operator", { scopeType: "project", scopeRefId: projectId });

  adminUserAccountId = await createTestUserAccount("Admin");
  await assign(adminUserAccountId, "Platform Admin", { scopeType: "platform", scopeRefId: null });
});

afterAll(async () => {
  const lots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = lots.map((l) => l.id);
  const transformationIds = (
    await prisma.lotTransformation.findMany({
      where: { OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] },
      select: { id: true },
    })
  ).map((t) => t.id);

  const deviationIds = (
    await prisma.deviation.findMany({ where: { lotTransformationId: { in: transformationIds } }, select: { id: true } })
  ).map((d) => d.id);
  await prisma.correctiveAction.deleteMany({ where: assertDefinedWhere({ deviationId: { in: deviationIds } }) });
  await prisma.deviation.deleteMany({ where: assertDefinedWhere({ id: { in: deviationIds } }) });

  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformationIds } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformationIds } }) });
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ transformations: { some: { id: { in: transformationIds } } } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformationIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });

  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [operatorUserAccountId, adminUserAccountId] } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [operatorUserAccountId, adminUserAccountId] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: [organizationId, otherOrganizationId] } }) });
});

describe("movesMaterial — the run-opening trap", () => {
  it("declines a zero-output stage_change (a run-opening marker) and accepts the closing one", () => {
    expect(movesMaterial({ transformationType: "stage_change", outputCount: 0 })).toBe(false);
    expect(movesMaterial({ transformationType: "stage_change", outputCount: 1 })).toBe(true);
  });

  it("accepts loss/disposal/sale despite having no outputs, and never double-counts sample_extraction", () => {
    expect(movesMaterial({ transformationType: "loss", outputCount: 0 })).toBe(true);
    expect(movesMaterial({ transformationType: "disposal", outputCount: 0 })).toBe(true);
    expect(movesMaterial({ transformationType: "sale", outputCount: 0 })).toBe(true);
    // samples.ts already writes its own sample_removed event.
    expect(movesMaterial({ transformationType: "sample_extraction", outputCount: 0 })).toBe(false);
  });

  it("treats only split/merge/blend as mass-conserving", () => {
    expect(conservesMass("split")).toBe(true);
    expect(conservesMass("merge")).toBe(true);
    expect(conservesMass("blend")).toBe(true);
    // A stage change legitimately loses mass — that loss is the yield.
    expect(conservesMass("stage_change")).toBe(false);
  });
});

describe("conservation across transformations", () => {
  it("zeroes the input lot on a stage_change and credits the output", async () => {
    const source = await lotWithQuantity("sc-in", 186.4);

    const { outputLots } = await recordTransformation(operatorUserAccountId, {
      transformationType: "stage_change",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: source.id }],
      outputs: [{ lotCode: `${RUN_ID}-sc-out`, lotType: "processing", quantity: 171.8, unit: "kg" }],
    });

    const inputAfter = await computeCurrentQuantity(operatorUserAccountId, source.id);
    expect(inputAfter.quantity.toNumber()).toBe(0);
    // Consumed, not unrecorded — a real zero is a claim worth being able to make.
    expect(inputAfter.recorded).toBe(true);

    const outputAfter = await computeCurrentQuantity(operatorUserAccountId, outputLots[0]!.id);
    expect(outputAfter.quantity.toNumber()).toBe(171.8);
  });

  it("decrements a split by exactly the declared amount and leaves the remainder", async () => {
    const source = await lotWithQuantity("sp-in", 100);

    await recordTransformation(operatorUserAccountId, {
      transformationType: "split",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: source.id, quantity: 30, unit: "kg" }],
      outputs: [{ lotCode: `${RUN_ID}-sp-out`, lotType: "processing", quantity: 30, unit: "kg" }],
    });

    const after = await computeCurrentQuantity(operatorUserAccountId, source.id);
    expect(after.quantity.toNumber()).toBe(70);
  });

  it("zeroes every input of a merge and credits the sum to the output", async () => {
    const a = await lotWithQuantity("mg-a", 10);
    const b = await lotWithQuantity("mg-b", 20);
    const c = await lotWithQuantity("mg-c", 30);

    const { outputLots } = await recordTransformation(operatorUserAccountId, {
      transformationType: "merge",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: a.id }, { lotId: b.id }, { lotId: c.id }],
      outputs: [{ lotCode: `${RUN_ID}-mg-out`, lotType: "processing", quantity: 60, unit: "kg" }],
    });

    for (const lot of [a, b, c]) {
      const balance = await computeCurrentQuantity(operatorUserAccountId, lot.id);
      expect(balance.quantity.toNumber()).toBe(0);
    }
    const merged = await computeCurrentQuantity(operatorUserAccountId, outputLots[0]!.id);
    expect(merged.quantity.toNumber()).toBe(60);
  });

  it("does not inflate the total across a chain — the bug this ticket exists for", async () => {
    const source = await lotWithQuantity("chain-in", 200);

    const { outputLots } = await recordTransformation(operatorUserAccountId, {
      transformationType: "split",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: source.id, quantity: 200, unit: "kg" }],
      outputs: [
        { lotCode: `${RUN_ID}-chain-a`, lotType: "processing", quantity: 120, unit: "kg" },
        { lotCode: `${RUN_ID}-chain-b`, lotType: "processing", quantity: 80, unit: "kg" },
      ],
    });

    const balances = await Promise.all(
      [source, ...outputLots].map((l) => computeCurrentQuantity(operatorUserAccountId, l.id)),
    );
    const total = balances.reduce((sum, b) => sum + b.quantity.toNumber(), 0);
    // Pre-P0 this was 400: the parent kept its 200 and the children added 200.
    expect(total).toBe(200);
  });
});

describe("the run-opening transformation writes no decrement", () => {
  it("leaves the lot's quantity untouched for the duration of a fermentation, then decrements exactly once", async () => {
    const source = await lotWithQuantity("ferm", 50);

    await startFermentationRun(operatorUserAccountId, {
      lotId: source.id,
      startedAt: new Date(),
      quantity: 50,
      unit: "kg",
      provenanceClass: "original_record",
    });

    const during = await computeCurrentQuantity(operatorUserAccountId, source.id);
    // The coffee is in the tank. It has not gone anywhere.
    expect(during.quantity.toNumber()).toBe(50);

    const run = await prisma.fermentationRun.findFirstOrThrow({
      where: { transformations: { some: { inputs: { some: { lotId: source.id } } } } },
      orderBy: { startedAt: "desc" },
    });

    await endFermentationRun(operatorUserAccountId, {
      fermentationRunId: run.id,
      endedAt: new Date(),
      outputLotCode: `${RUN_ID}-ferm-out`,
      outputLotType: "processing",
      quantity: 42,
      unit: "kg",
      provenanceClass: "original_record",
    });

    const after = await computeCurrentQuantity(operatorUserAccountId, source.id);
    expect(after.quantity.toNumber()).toBe(0);

    const decrements = await prisma.quantityEvent.count({
      where: { lotId: source.id, eventType: "transfer_out" },
    });
    // Exactly one — start-then-end must not decrement twice.
    expect(decrements).toBe(1);
  });
});

describe("missing data stays missing", () => {
  it("writes no decrement for a lot that was never weighed, and does not invent a zero", async () => {
    const source = await lotWithQuantity("noledger", null);

    await recordTransformation(operatorUserAccountId, {
      transformationType: "stage_change",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: source.id }],
      outputs: [{ lotCode: `${RUN_ID}-noledger-out`, lotType: "processing" }],
    });

    const after = await computeCurrentQuantity(operatorUserAccountId, source.id);
    // Still "never recorded", not "recorded and empty" — ADR-080's distinction.
    expect(after.recorded).toBe(false);
    expect(await prisma.quantityEvent.count({ where: { lotId: source.id } })).toBe(0);
  });

  it("rejects a split with no declared input quantity — how much was taken cannot be inferred", async () => {
    const source = await lotWithQuantity("sp-noqty", 100);

    await expect(
      recordTransformation(operatorUserAccountId, {
        transformationType: "split",
        occurredAt: new Date(),
        provenanceClass: "original_record",
        inputs: [{ lotId: source.id }],
        outputs: [{ lotCode: `${RUN_ID}-sp-noqty-out`, lotType: "processing", quantity: 30, unit: "kg" }],
      }),
    ).rejects.toThrow(MassBalanceError);
  });

  it("records unexplained as NULL, not zero, when an input has no ledger", async () => {
    const weighed = await lotWithQuantity("mix-weighed", 40);
    const unweighed = await lotWithQuantity("mix-unweighed", null);

    const { transformation } = await recordTransformation(operatorUserAccountId, {
      transformationType: "merge",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: weighed.id }, { lotId: unweighed.id }],
      outputs: [{ lotCode: `${RUN_ID}-mix-out`, lotType: "processing", quantity: 40, unit: "kg" }],
    });

    const stored = await prisma.lotTransformation.findUniqueOrThrow({ where: { id: transformation.id } });
    expect(stored.unexplainedQuantity).toBeNull();
  });
});

describe("tolerance and deviations", () => {
  it("stores the unexplained difference and raises no Deviation within tolerance", async () => {
    const source = await lotWithQuantity("tol-ok", 100);

    const { transformation } = await recordTransformation(operatorUserAccountId, {
      transformationType: "split",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: source.id, quantity: 100, unit: "kg" }],
      // 1 kg unaccounted against a 2% default tolerance = 2 kg.
      outputs: [
        { lotCode: `${RUN_ID}-tol-ok-a`, lotType: "processing", quantity: 60, unit: "kg" },
        { lotCode: `${RUN_ID}-tol-ok-b`, lotType: "processing", quantity: 39, unit: "kg" },
      ],
    });

    const stored = await prisma.lotTransformation.findUniqueOrThrow({ where: { id: transformation.id } });
    expect(Number(stored.unexplainedQuantity)).toBe(1);
    expect(await prisma.deviation.count({ where: { lotTransformationId: transformation.id } })).toBe(0);
  });

  it("raises exactly one Deviation outside tolerance, and still records the transformation", async () => {
    const source = await lotWithQuantity("tol-bad", 100);

    const { transformation } = await recordTransformation(operatorUserAccountId, {
      transformationType: "split",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: source.id, quantity: 100, unit: "kg" }],
      outputs: [{ lotCode: `${RUN_ID}-tol-bad-a`, lotType: "processing", quantity: 80, unit: "kg" }],
    });

    const stored = await prisma.lotTransformation.findUniqueOrThrow({ where: { id: transformation.id } });
    expect(Number(stored.unexplainedQuantity)).toBe(20);

    const deviations = await prisma.deviation.findMany({ where: { lotTransformationId: transformation.id } });
    expect(deviations).toHaveLength(1);
    expect(deviations[0]!.severity).toBe("mass_balance");
  });

  it("counts declared loss as explained", async () => {
    const source = await lotWithQuantity("loss-ok", 100);

    const { transformation } = await recordTransformation(operatorUserAccountId, {
      transformationType: "split",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: source.id, quantity: 100, unit: "kg" }],
      outputs: [{ lotCode: `${RUN_ID}-loss-ok-a`, lotType: "processing", quantity: 80, unit: "kg" }],
      declaredLossQuantity: 20,
      declaredLossUnit: "kg",
      declaredLossReason: "Agua y mucílago",
    });

    const stored = await prisma.lotTransformation.findUniqueOrThrow({ where: { id: transformation.id } });
    expect(Number(stored.unexplainedQuantity)).toBe(0);
    expect(await prisma.deviation.count({ where: { lotTransformationId: transformation.id } })).toBe(0);
  });

  it("does not raise a Deviation for a stage change, whose mass loss is the yield", async () => {
    const source = await lotWithQuantity("yield", 500);

    const { transformation } = await recordTransformation(operatorUserAccountId, {
      transformationType: "stage_change",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: source.id }],
      // Cherry to parchment loses roughly four fifths. That is the yield, not
      // a discrepancy, and alarming on it would alarm on every correct row.
      outputs: [{ lotCode: `${RUN_ID}-yield-out`, lotType: "processing", quantity: 100, unit: "kg" }],
    });

    expect(await prisma.deviation.count({ where: { lotTransformationId: transformation.id } })).toBe(0);
    // The material still moved — the decrement is what mattered.
    const after = await computeCurrentQuantity(operatorUserAccountId, source.id);
    expect(after.quantity.toNumber()).toBe(0);
  });
});

describe("lot:override_balance", () => {
  it("denies a Farm Operator, who records what the scale says rather than accepting a gap", async () => {
    const source = await lotWithQuantity("ovr-denied", 100);

    await expect(
      recordTransformation(operatorUserAccountId, {
        transformationType: "split",
        occurredAt: new Date(),
        provenanceClass: "original_record",
        inputs: [{ lotId: source.id, quantity: 100, unit: "kg" }],
        outputs: [{ lotCode: `${RUN_ID}-ovr-denied-a`, lotType: "processing", quantity: 80, unit: "kg" }],
        acceptUnexplained: { reason: "Balanza descalibrada" },
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("lets a Platform Admin accept the gap, recording the reason against the Deviation", async () => {
    const source = await lotWithQuantity("ovr-ok", 100);

    const { transformation } = await recordTransformation(adminUserAccountId, {
      transformationType: "split",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: source.id, quantity: 100, unit: "kg" }],
      outputs: [{ lotCode: `${RUN_ID}-ovr-ok-a`, lotType: "processing", quantity: 80, unit: "kg" }],
      acceptUnexplained: { reason: "Balanza descalibrada, verificado contra la romana" },
    });

    // The Deviation still exists — the discrepancy happened either way.
    const deviation = await prisma.deviation.findFirstOrThrow({ where: { lotTransformationId: transformation.id } });
    const actions = await prisma.correctiveAction.findMany({ where: { deviationId: deviation.id } });
    expect(actions).toHaveLength(1);
    expect(actions[0]!.actionText).toContain("Balanza descalibrada");
    expect(actions[0]!.takenAt).not.toBeNull();
  });
});

describe("lot code uniqueness is scoped to the organization", () => {
  it("allows the same code under two organizations and refuses it under one", async () => {
    const code = `${RUN_ID}-shared-code`;

    await prisma.lot.create({ data: { lotCode: code, lotType: "cherry", organizationId, createdBy: operatorUserAccountId } });
    // A different farm numbering its own batch the same way is ordinary.
    await prisma.lot.create({
      data: { lotCode: code, lotType: "cherry", organizationId: otherOrganizationId, createdBy: operatorUserAccountId },
    });

    await expect(
      prisma.lot.create({ data: { lotCode: code, lotType: "cherry", organizationId, createdBy: operatorUserAccountId } }),
    ).rejects.toThrow();
  });
});
