import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { getApiaryList } from "../../lib/apiary/hives";

export const dynamic = "force-dynamic";

export default async function ApiariesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Apiary");
  const { items: apiaries, truncated, limit, sinAmbito } = await getApiaryList(user.userAccountId);

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("apiariesTitle")}</h1>
      <p className="nn-muted">{t("apiariesIntro")}</p>

      {/* ADR-087 — a cut-off list says so. */}
      {truncated ? <p className="nn-muted">{t("listTruncated", { limit })}</p> : null}

      {/* Segunda lente: «no hay» y «no puedes ver» no son el mismo hecho. Esta
          pantalla afirmaba lo primero a quien le pasaba lo segundo. Se nombra
          la causa y a quién pedirle el acceso, igual que en `/lots`. */}
      {apiaries.length === 0 ? (
        sinAmbito ? (
          <>
            <p className="nn-muted">{t("sinAmbitoHeading")}</p>
            <p className="nn-muted">{t("sinAmbitoBody")}</p>
          </>
        ) : (
          <p className="nn-muted">{t("noApiaries")}</p>
        )
      ) : (
        <div className="nn-grid">
          {apiaries.map((apiary) => (
            <Link key={apiary.id} href={`/apiaries/${apiary.id}`} className="nn-card-link">
              <h3>{apiary.name}</h3>
              <p className="nn-muted">{t("hiveCount", { count: apiary.hives.length })}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
