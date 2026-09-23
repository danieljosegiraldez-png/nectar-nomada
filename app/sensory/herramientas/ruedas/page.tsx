import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { listarRuedasSensoriales } from "../../../../lib/sensory/ruedas";

export const dynamic = "force-dynamic";

export default async function RuedasSensorialesPage() {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations("SensoryWheels")]);
  const ruedas = await listarRuedasSensoriales(user?.userAccountId);
  return <main>
    <span className="nn-badge">{t("badge")}</span>
    <h1>{t("title")}</h1>
    <p>{t("intro")}</p>
    {ruedas.length ? <div className="nn-grid">
      {ruedas.map((rueda) => <article key={rueda.id} className="nn-card">
        <h2><Link href={`/sensory/herramientas/ruedas/${rueda.domain}`}>{rueda.title}</Link></h2>
        {rueda.version ? <>
          <p>{t("edition", { version: rueda.version.version })} · {rueda.version.sourceAuthor}</p>
          <p className="nn-muted">{rueda.version.license}</p>
          {!rueda.isPublic ? <span className="nn-badge">{t("draft")}</span> : null}
        </> : <p>{t("noSource")}</p>}
      </article>)}
    </div> : <p>{t("empty")}</p>}
  </main>;
}
