"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import {
  updateTaskStatus,
  createFieldSubmission,
  requestAssetUpload,
  finalizeAssetUpload,
  PartnerAccessError,
  type TaskStatusInput,
} from "../../lib/partner/workspace";

export interface PartnerActionState {
  error?: string;
}

export async function updateTaskStatusFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const taskId = String(formData.get("taskId") ?? "");
  const status = String(formData.get("status") ?? "") as TaskStatusInput;
  const projectId = String(formData.get("projectId") ?? "");

  await updateTaskStatus(user.userAccountId, taskId, status);
  revalidatePath(`/partner/${projectId}`);
}

export async function createFieldSubmissionAction(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Partner");
  const projectId = String(formData.get("projectId") ?? "");
  const title = String(formData.get("title") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const taskId = String(formData.get("taskId") ?? "") || null;

  try {
    await createFieldSubmission(user.userAccountId, { projectId, title, notes, taskId });
  } catch (error) {
    if (error instanceof PartnerAccessError) {
      return { error: t(`error_${error.message}` as "error_invalid_submission") };
    }
    throw error;
  }

  revalidatePath(`/partner/${projectId}`);
  return {};
}

export async function requestUploadAction(
  projectId: string,
  originalFilename: string,
  contentType: string,
): Promise<{ uploadUrl: string; storageKey: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Partner");
  try {
    return await requestAssetUpload(user.userAccountId, { projectId, originalFilename, contentType });
  } catch (error) {
    if (error instanceof PartnerAccessError) {
      return { error: t(`error_${error.message}` as "error_no_project_access") };
    }
    if (error instanceof Error) {
      return { error: error.message };
    }
    throw error;
  }
}

export async function finalizeUploadAction(
  projectId: string,
  storageKey: string,
  mimeType: string,
  sizeBytes: number,
  originalFilename: string,
): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Partner");
  try {
    await finalizeAssetUpload(user.userAccountId, { projectId, storageKey, mimeType, sizeBytes, originalFilename });
  } catch (error) {
    if (error instanceof PartnerAccessError) {
      return { error: t(`error_${error.message}` as "error_no_project_access") };
    }
    throw error;
  }

  revalidatePath(`/partner/${projectId}`);
  return { ok: true };
}
