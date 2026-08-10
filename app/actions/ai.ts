"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { can } from "../../lib/rbac/service";
import { generateDataCompletenessSuggestions, decideSuggestion, type SuggestionDecision } from "../../lib/ai/service";

export async function generateSuggestionsFormAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // generateDataCompletenessSuggestions() itself has no permission check —
  // it's meant to be invoked by a scheduled/automated trigger, not directly
  // reachable by any authenticated user. This form action is the only
  // human-facing entry point to it in this slice, so the check belongs
  // here.
  const allowed = await can(user.userAccountId, "review_suggestion", "ai", { scopeType: "platform", scopeRefId: null });
  if (!allowed) {
    redirect("/ai");
  }

  await generateDataCompletenessSuggestions();
  revalidatePath("/ai");
}

export async function decideSuggestionFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const recommendationId = String(formData.get("recommendationId") ?? "");
  const decision = String(formData.get("decision") ?? "") as SuggestionDecision;

  await decideSuggestion(user.userAccountId, { recommendationId, decision });
  revalidatePath("/ai");
}
