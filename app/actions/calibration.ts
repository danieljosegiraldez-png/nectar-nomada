"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { createReferenceStandard, createCalibrationSession, recordCalibrationResult } from "../../lib/sensory/calibration";

export async function createReferenceStandardFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const thresholdValue = String(formData.get("typicalThresholdValue") ?? "").trim();

  await createReferenceStandard(user.userAccountId, {
    compoundName: String(formData.get("compoundName") ?? ""),
    sensoryDescriptor: String(formData.get("sensoryDescriptor") ?? ""),
    category: String(formData.get("category") ?? ""),
    typicalThresholdValue: thresholdValue === "" ? null : Number(thresholdValue),
    thresholdUnit: String(formData.get("thresholdUnit") ?? "") || null,
    standardOrigin: String(formData.get("standardOrigin") ?? "commercial_third_party") as
      | "commercial_third_party"
      | "self_created"
      | "adapted_from_commercial",
    supplierProductReference: String(formData.get("supplierProductReference") ?? "") || null,
    dataSheetReference: String(formData.get("dataSheetReference") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
  });

  revalidatePath("/calibration");
}

export async function createCalibrationSessionFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const sessionDate = String(formData.get("sessionDate") ?? "");

  await createCalibrationSession(user.userAccountId, {
    sessionDate: new Date(sessionDate),
    category: String(formData.get("category") ?? ""),
    notes: String(formData.get("notes") ?? "") || null,
  });

  revalidatePath("/calibration");
}

export async function recordCalibrationResultFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const calibrationSessionId = String(formData.get("calibrationSessionId") ?? "");
  const intensity = String(formData.get("perceivedIntensityRating") ?? "").trim();
  const concentration = String(formData.get("actualConcentrationPresented") ?? "").trim();

  await recordCalibrationResult(user.userAccountId, {
    calibrationSessionId,
    evaluatorPersonId: String(formData.get("evaluatorPersonId") ?? ""),
    referenceStandardId: String(formData.get("referenceStandardId") ?? ""),
    correctlyIdentified: formData.get("correctlyIdentified") === "on",
    perceivedDescriptorGiven: String(formData.get("perceivedDescriptorGiven") ?? "") || null,
    perceivedIntensityRating: intensity === "" ? null : Number(intensity),
    actualConcentrationPresented: concentration === "" ? null : Number(concentration),
    notes: String(formData.get("notes") ?? "") || null,
  });

  revalidatePath(`/calibration/${calibrationSessionId}`);
}
