"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { submitAssessment, computePanelResult, SensoryAccessError } from "../../lib/sensory/service";

export interface SensoryActionState {
  error?: string;
}

export async function submitAssessmentAction(
  _prevState: SensoryActionState,
  formData: FormData,
): Promise<SensoryActionState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Sensory");

  const blindSampleId = String(formData.get("blindSampleId") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");
  const overallScoreRaw = formData.get("overallScore");
  const overallScore = overallScoreRaw ? Number(overallScoreRaw) : null;
  const comment = String(formData.get("comment") ?? "") || null;

  const attributeIds = formData.getAll("attributeId").map(String);
  const attributeResponses = attributeIds
    .map((attributeId) => {
      const raw = formData.get(`attr_${attributeId}`);
      if (raw === null || raw === "") return null;
      return { attributeId, value: Number(raw) };
    })
    .filter((r): r is { attributeId: string; value: number } => r !== null);

  try {
    await submitAssessment(user.userAccountId, { blindSampleId, overallScore, comment, attributeResponses });
  } catch (error) {
    if (error instanceof SensoryAccessError) {
      return { error: t(`error_${error.message}` as "error_already_submitted") };
    }
    throw error;
  }

  revalidatePath(`/sensory/${sessionId}`);
  return {};
}

export async function computePanelResultFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const blindSampleId = String(formData.get("blindSampleId") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");

  await computePanelResult(user.userAccountId, blindSampleId);
  revalidatePath(`/sensory/${sessionId}`);
}
