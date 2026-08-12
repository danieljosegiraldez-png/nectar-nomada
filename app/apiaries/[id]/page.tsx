import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getApiaryDetail, getManageableApiaryProjects } from "../../../lib/apiary/hives";
import { NewHiveForm } from "../../components/apiary/NewHiveForm";

export const dynamic = "force-dynamic";

export default async function ApiaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const t = await getTranslations("Apiary");
  const [apiary, projects] = await Promise.all([
    getApiaryDetail(user.userAccountId, id),
    getManageableApiaryProjects(user.userAccountId),
  ]);

  return (
    <div>
      <p>
        <Link href="/apiaries">{t("backToApiaries")}</Link>
      </p>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{apiary.name}</h1>

      <section className="nn-section">
        <h2>{t("hivesHeading")}</h2>
        {apiary.hives.length === 0 ? (
          <p className="nn-muted">{t("noHives")}</p>
        ) : (
          <div className="nn-grid">
            {apiary.hives.map((hive) => (
              <Link key={hive.id} href={`/apiaries/${apiary.id}/hives/${hive.id}`} className="nn-card-link">
                <h3>{hive.identifier}</h3>
                <p className="nn-muted">{t(`hiveStatus_${hive.status}`)}</p>
                <p className="nn-detail-meta">
                  {hive.colonies.length > 0 ? t("colonyPresent") : t("colonyAbsent")}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("newHiveHeading")}</h2>
        <NewHiveForm locationId={apiary.id} projects={projects} />
      </section>
    </div>
  );
}
