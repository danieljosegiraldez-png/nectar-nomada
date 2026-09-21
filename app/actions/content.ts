"use server";

import { PersonaNoPermitidaError } from "../../lib/people/quienLoHizo";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import {
  createStory,
  updateStory,
  setStoryStatus,
  ContentAccessError,
  ContentValidationError,
} from "../../lib/content/stories";
import type { ClassificationLevel, RecordStatus } from "../../generated/prisma/client";

/**
 * Errors come back as a query string rather than a throw, the same pattern
 * ADR-074 established for /admin/users. "You do not clear this story's
 * classification" is a sentence the author needs to read; an unhandled throw
 * renders a 500 and loses it.
 */
function backTo(path: string, message?: string): never {
  redirect(message ? `${path}?error=${encodeURIComponent(message)}` : `${path}?ok=1`);
}

/** An empty select is "none", never the empty string, which is not a uuid. */
function optionalId(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  return raw === "" ? null : raw;
}

export async function createStoryFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let storyId: string;
  try {
    const story = await createStory(user.userAccountId, {
      title: String(formData.get("title") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      bodyMarkdown: String(formData.get("bodyMarkdown") ?? ""),
      projectId: optionalId(formData, "projectId"),
      locationId: optionalId(formData, "locationId"),
      authorPersonId: optionalId(formData, "authorPersonId"),
    });
    storyId = story.id;
  } catch (error) {
    if (error instanceof PersonaNoPermitidaError) backTo("/content/new", "persona_no_permitida");
    if (error instanceof ContentAccessError || error instanceof ContentValidationError) {
      backTo("/content/new", error.message);
    }
    throw error;
  }

  revalidatePath("/content");
  redirect(`/content/${storyId}?ok=1`);
}

export async function updateStoryFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const storyId = String(formData.get("storyId") ?? "");

  try {
    await updateStory(user.userAccountId, storyId, {
      title: String(formData.get("title") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      bodyMarkdown: String(formData.get("bodyMarkdown") ?? ""),
      projectId: optionalId(formData, "projectId"),
      locationId: optionalId(formData, "locationId"),
      authorPersonId: optionalId(formData, "authorPersonId"),
    });
  } catch (error) {
    if (error instanceof PersonaNoPermitidaError) backTo(`/content/${storyId}`, "persona_no_permitida");
    if (error instanceof ContentAccessError || error instanceof ContentValidationError) {
      backTo(`/content/${storyId}`, error.message);
    }
    throw error;
  }

  revalidatePath("/content");
  revalidatePath(`/content/${storyId}`);
  // The public surfaces too: an edit to an approved story changes what
  // visitors are already reading.
  revalidatePath("/stories");
  backTo(`/content/${storyId}`);
}

export async function setStoryStatusFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const storyId = String(formData.get("storyId") ?? "");

  const status = String(formData.get("status") ?? "") as RecordStatus;
  const rawClassification = String(formData.get("classification") ?? "").trim();

  try {
    await setStoryStatus(
      user.userAccountId,
      storyId,
      status,
      rawClassification === "" ? undefined : (rawClassification as ClassificationLevel),
    );
  } catch (error) {
    if (error instanceof ContentAccessError) backTo(`/content/${storyId}`, error.message);
    throw error;
  }

  revalidatePath("/content");
  revalidatePath(`/content/${storyId}`);
  revalidatePath("/stories");
  revalidatePath("/discover");
  backTo(`/content/${storyId}`);
}
