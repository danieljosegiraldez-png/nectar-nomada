import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { getCompetitionsWithEditions, CompetitionAccessError } from "../../lib/competitions/service";

export const dynamic = "force-dynamic";

export default async function CompetitionsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Competitions");

  let competitions;
  try {
    competitions = await getCompetitionsWithEditions(user.userAccountId);
  } catch (error) {
    if (error instanceof CompetitionAccessError) {
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

      {competitions.length === 0 ? (
        <p className="nn-muted">{t("noCompetitions")}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {competitions.map((competition) => (
            <li key={competition.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0 }}>{competition.name}</h3>
              <p className="nn-muted">{competition.description}</p>
              <ul>
                {competition.editions.map((edition) => (
                  <li key={edition.id}>
                    <Link href={`/competitions/${edition.id}`}>
                      {edition.label} — {t(`editionStatus_${edition.status}` as "editionStatus_planning")}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
