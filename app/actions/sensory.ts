"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { submitAssessment, computePanelResult, SensoryAccessError } from "../../lib/sensory/service";
import { crearSesionDeCata, invitarParticipante, SesionDeCataError } from "../../lib/sensory/sessions";

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

/**
 * Crear una sesión de cata.
 *
 * Las muestras llegan como valores repetidos del mismo campo `muestras`, en el
 * orden en que las pintó la pantalla: `getAll` conserva ese orden, y el orden es
 * el que decide qué código ciego le toca a cada una.
 */
export async function crearSesionDeCataAction(
  _prevState: SensoryActionState,
  formData: FormData,
): Promise<SensoryActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Sensory");

  const muestras = formData.getAll("muestras").map((v) => String(v)).filter(Boolean);
  let sesionId: string;
  try {
    const sesion = await crearSesionDeCata(user.userAccountId, {
      name: String(formData.get("name") ?? ""),
      protocolVersionId: String(formData.get("protocolVersionId") ?? ""),
      muestras,
      purpose: (String(formData.get("purpose") ?? "").trim() || null) as never,
      subject: (String(formData.get("subject") ?? "").trim() || null) as never,
      preparationMethod: (String(formData.get("preparationMethod") ?? "").trim() || null),
    });
    sesionId = sesion.id;
  } catch (error) {
    if (error instanceof SesionDeCataError) return { error: t(`error_${error.message}` as "error_name_required") };
    if (error instanceof SensoryAccessError) return { error: t("error_no_access") };
    throw error;
  }

  revalidatePath("/sensory");
  redirect(`/sensory/${sesionId}`);
}

/** Invitar a alguien a puntuar en una cata. */
export async function invitarParticipanteAction(
  _prevState: SensoryActionState,
  formData: FormData,
): Promise<SensoryActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Sensory");

  const sessionId = String(formData.get("sessionId") ?? "");
  try {
    await invitarParticipante(user.userAccountId, {
      sessionId,
      invitadoUserAccountId: String(formData.get("invitadoUserAccountId") ?? ""),
    });
  } catch (error) {
    if (error instanceof SesionDeCataError) return { error: t(`error_${error.message}` as "error_name_required") };
    throw error;
  }

  revalidatePath(`/sensory/${sessionId}`);
  return {};
}
