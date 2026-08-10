import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { getPendingSuggestions, getReviewedSuggestions, AiAccessError } from "../../lib/ai/service";
import { generateSuggestionsFormAction, decideSuggestionFormAction } from "../actions/ai";

export const dynamic = "force-dynamic";

export default async function AiSuggestionsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Ai");

  let pending;
  let reviewed;
  try {
    [pending, reviewed] = await Promise.all([
      getPendingSuggestions(user.userAccountId),
      getReviewedSuggestions(user.userAccountId),
    ]);
  } catch (error) {
    if (error instanceof AiAccessError) {
      return (
        <div>
          <span className="nn-badge">{t("badge")}</span>
          <h1>{t("title")}</h1>
          <p className="nn-muted">{t("noAccess")}</p>
        </div>
      );
    }
    throw error;
  }

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("title")}</h1>

      <form action={generateSuggestionsFormAction} style={{ marginTop: "1rem" }}>
        <button type="submit" className="nn-button">
          {t("generateButton")}
        </button>
      </form>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("pendingHeading")}</h2>
        {pending.length === 0 ? (
          <p className="nn-muted">{t("noPending")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {pending.map((suggestion) => (
              <li key={suggestion.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
                <p className="nn-muted">
                  {suggestion.suggestionType} — {suggestion.model}
                </p>
                <p>{suggestion.recommendation}</p>
                <form
                  action={decideSuggestionFormAction}
                  style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}
                >
                  <input type="hidden" name="recommendationId" value={suggestion.id} />
                  <button type="submit" name="decision" value="accepted" className="nn-button">
                    {t("acceptButton")}
                  </button>
                  <button type="submit" name="decision" value="rejected" className="nn-button">
                    {t("rejectButton")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("reviewedHeading")}</h2>
        {reviewed.length === 0 ? (
          <p className="nn-muted">{t("noReviewed")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {reviewed.map((suggestion) => (
              <li key={suggestion.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
                <p>{suggestion.recommendation}</p>
                <p className="nn-muted">
                  {t(`status_${suggestion.status}` as "status_accepted")}
                  {suggestion.reviewer ? ` — ${suggestion.reviewer.person.displayName}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
