"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { finalizeResult, declareAward } from "../../lib/competitions/service";

export async function finalizeResultFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const entryId = String(formData.get("entryId") ?? "");
  const editionId = String(formData.get("editionId") ?? "");

  await finalizeResult(user.userAccountId, entryId);
  revalidatePath(`/competitions/${editionId}`);
}

export async function declareAwardFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const resultId = String(formData.get("resultId") ?? "");
  const editionId = String(formData.get("editionId") ?? "");
  const name = String(formData.get("awardName") ?? "");

  await declareAward(user.userAccountId, resultId, name);
  revalidatePath(`/competitions/${editionId}`);
}
