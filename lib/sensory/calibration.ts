/**
 * Reference Standards & Panel Calibration (BEVERAGE_SENSORY_PROTOCOLS.md §7,
 * DECISIONS.md ADR-035). Structurally distinct from a `SensorySession`: a
 * calibration session tests a panelist's demonstrated perceptual ability
 * against a known reference standard, it does not evaluate a product.
 *
 * Gating reuses `sensory:manage_session` (RBAC.md/lib/rbac/catalog.ts)
 * rather than introducing a new permission — running a calibration program
 * is the same kind of panel-administration authority as running a judging
 * session, held by the "Sensory Head Judge" profile. No `ReferenceStandard`
 * rows carry invented compound/threshold data — CLAUDE.md §54.
 */
import { prisma } from "../db";
import { can } from "../rbac/service";

export class CalibrationAccessError extends Error {}

async function requireManagePermission(userAccountId: string) {
  const allowed = await can(userAccountId, "manage_session", "sensory", { scopeType: "platform", scopeRefId: null });
  if (!allowed) {
    throw new CalibrationAccessError("no_manage_access");
  }
}

export async function getReferenceStandards(userAccountId: string) {
  await requireManagePermission(userAccountId);
  return prisma.referenceStandard.findMany({
    include: { selfCreatedDetail: true, supplierOrganization: true },
    orderBy: [{ category: "asc" }, { compoundName: "asc" }],
  });
}

export async function createReferenceStandard(
  userAccountId: string,
  input: {
    compoundName: string;
    sensoryDescriptor: string;
    category: string;
    typicalThresholdValue?: number | null;
    thresholdUnit?: string | null;
    standardOrigin: "commercial_third_party" | "self_created" | "adapted_from_commercial";
    supplierOrganizationId?: string | null;
    supplierProductReference?: string | null;
    dataSheetReference?: string | null;
    notes?: string | null;
  },
) {
  await requireManagePermission(userAccountId);
  return prisma.referenceStandard.create({
    data: {
      compoundName: input.compoundName,
      sensoryDescriptor: input.sensoryDescriptor,
      category: input.category,
      typicalThresholdValue: input.typicalThresholdValue ?? null,
      thresholdUnit: input.thresholdUnit ?? null,
      standardOrigin: input.standardOrigin,
      supplierOrganizationId: input.supplierOrganizationId ?? null,
      supplierProductReference: input.supplierProductReference ?? null,
      dataSheetReference: input.dataSheetReference ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function getCalibrationSessions(userAccountId: string) {
  await requireManagePermission(userAccountId);
  return prisma.calibrationSession.findMany({
    include: {
      conductedByPerson: true,
      results: { include: { evaluatorPerson: true, referenceStandard: true } },
    },
    orderBy: { sessionDate: "desc" },
  });
}

export async function getCalibrationSessionDetail(userAccountId: string, calibrationSessionId: string) {
  await requireManagePermission(userAccountId);
  return prisma.calibrationSession.findUniqueOrThrow({
    where: { id: calibrationSessionId },
    include: {
      conductedByPerson: true,
      results: { include: { evaluatorPerson: true, referenceStandard: true }, orderBy: { id: "asc" } },
    },
  });
}

export async function createCalibrationSession(
  userAccountId: string,
  input: { sessionDate: Date; category: string; conductedByPersonId?: string | null; notes?: string | null },
) {
  await requireManagePermission(userAccountId);
  return prisma.calibrationSession.create({
    data: {
      sessionDate: input.sessionDate,
      category: input.category,
      conductedByPersonId: input.conductedByPersonId ?? null,
      notes: input.notes ?? null,
    },
  });
}

/**
 * Records one panelist's result against one reference standard within a
 * calibration session, and upserts their EvaluatorSensitivityProfile —
 * the panel-trustworthiness record BEVERAGE_SENSORY_PROTOCOLS.md §7.3
 * describes (an evaluator's future Assessments are only as trustworthy as
 * their demonstrated, tested perceptual history).
 */
export async function recordCalibrationResult(
  userAccountId: string,
  input: {
    calibrationSessionId: string;
    evaluatorPersonId: string;
    referenceStandardId: string;
    correctlyIdentified: boolean;
    perceivedDescriptorGiven?: string | null;
    perceivedIntensityRating?: number | null;
    actualConcentrationPresented?: number | null;
    notes?: string | null;
  },
) {
  await requireManagePermission(userAccountId);

  const result = await prisma.calibrationResult.create({
    data: {
      calibrationSessionId: input.calibrationSessionId,
      evaluatorPersonId: input.evaluatorPersonId,
      referenceStandardId: input.referenceStandardId,
      correctlyIdentified: input.correctlyIdentified,
      perceivedDescriptorGiven: input.perceivedDescriptorGiven ?? null,
      perceivedIntensityRating: input.perceivedIntensityRating ?? null,
      actualConcentrationPresented: input.actualConcentrationPresented ?? null,
      notes: input.notes ?? null,
    },
  });

  await prisma.evaluatorSensitivityProfile.upsert({
    where: {
      personId_referenceStandardId: {
        personId: input.evaluatorPersonId,
        referenceStandardId: input.referenceStandardId,
      },
    },
    update: {
      lastCalibrationDate: new Date(),
      confidenceLevel: "regularly_calibrated",
      ...(input.correctlyIdentified && input.actualConcentrationPresented != null
        ? { demonstratedThreshold: input.actualConcentrationPresented }
        : {}),
    },
    create: {
      personId: input.evaluatorPersonId,
      referenceStandardId: input.referenceStandardId,
      lastCalibrationDate: new Date(),
      confidenceLevel: "tested_once",
      demonstratedThreshold:
        input.correctlyIdentified && input.actualConcentrationPresented != null
          ? input.actualConcentrationPresented
          : null,
    },
  });

  return result;
}

/** Small helper for populating evaluator/reference-standard selects in the calibration UI. */
export async function getCalibrationFormOptions(userAccountId: string) {
  await requireManagePermission(userAccountId);
  const [people, referenceStandards] = await Promise.all([
    prisma.person.findMany({ select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    prisma.referenceStandard.findMany({
      select: { id: true, compoundName: true, category: true },
      orderBy: [{ category: "asc" }, { compoundName: "asc" }],
    }),
  ]);
  return { people, referenceStandards };
}

export async function getEvaluatorSensitivityProfiles(userAccountId: string, personId: string) {
  await requireManagePermission(userAccountId);
  return prisma.evaluatorSensitivityProfile.findMany({
    where: { personId },
    include: { referenceStandard: true },
    orderBy: { lastCalibrationDate: "desc" },
  });
}
