import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getEditionDetail, CompetitionAccessError } from "../../../lib/competitions/service";
import { finalizeResultFormAction, declareAwardFormAction } from "../../actions/competitions";

export const dynamic = "force-dynamic";

export default async function CompetitionEditionPage({ params }: { params: Promise<{ editionId: string }> }) {
  const { editionId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Competitions");

  let edition;
  try {
    edition = await getEditionDetail(user.userAccountId, editionId);
  } catch (error) {
    if (error instanceof CompetitionAccessError) {
      notFound();
    }
    throw error;
  }

  return (
    <div>
      <Link href="/competitions" className="nn-back-link">
        {t("backToCompetitions")}
      </Link>

      <h1>
        {edition.competition.name} — {edition.label}
      </h1>

      {edition.categories.map((category) => (
        <section key={category.id} style={{ marginTop: "2rem" }}>
          <h2>{category.name}</h2>
          <p className="nn-muted">
            {category.sensoryProtocolVersion.protocol.name} v{category.sensoryProtocolVersion.version}
          </p>
          {category.sensorySession ? (
            <Link href={`/sensory/${category.sensorySession.id}`} className="nn-back-link">
              {t("goToJudgingLink")}
            </Link>
          ) : (
            <p className="nn-muted">{t("notJudgingYet")}</p>
          )}

          {category.entries.length === 0 ? (
            <p className="nn-muted">{t("noEntries")}</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {category.entries.map((entry) => (
                <li key={entry.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
                  <p>
                    <strong>{entry.sample.sampleCode}</strong> —{" "}
                    {entry.competitorPerson?.displayName ?? entry.competitorOrganization?.name ?? t("noCompetitor")}
                  </p>
                  <p className="nn-muted">{t(`entryStatus_${entry.status}` as "entryStatus_registered")}</p>

                  {entry.result ? (
                    <>
                      <p className="nn-price">
                        {t("finalScoreLabel", { score: entry.result.finalScore?.toNumber().toFixed(2) ?? "—" })}
                      </p>
                      {entry.result.award ? (
                        <p>{t("awardLabel", { name: entry.result.award.name })}</p>
                      ) : (
                        <form action={declareAwardFormAction} style={{ display: "flex", gap: "0.5rem" }}>
                          <input type="hidden" name="resultId" value={entry.result.id} />
                          <input type="hidden" name="editionId" value={editionId} />
                          <input type="text" name="awardName" placeholder={t("awardNamePlaceholder")} required />
                          <button type="submit" className="nn-button">
                            {t("declareAwardButton")}
                          </button>
                        </form>
                      )}
                    </>
                  ) : (
                    <form action={finalizeResultFormAction}>
                      <input type="hidden" name="entryId" value={entry.id} />
                      <input type="hidden" name="editionId" value={editionId} />
                      <button type="submit" className="nn-button">
                        {t("finalizeResultButton")}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
