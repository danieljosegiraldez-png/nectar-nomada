import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { listProtocols } from "../../lib/research/protocols";
import { puedeVerInvestigacion } from "../../lib/research/access";
import { BotonDeEnvio } from "../components/BotonDeEnvio";

export const dynamic = "force-dynamic";

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ variable?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const puedeVerResearch = await puedeVerInvestigacion(user.userAccountId);

  const { variable } = await searchParams;
  const t = await getTranslations("Research");
  const protocols = await listProtocols(user.userAccountId, { variableName: variable ?? null });

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("title")}</h1>
      <p className="nn-muted">{t("intro")}</p>
      <p style={{ marginTop: "1rem" }}>
                {/* Daniel, 2026-09-27: lo que no puedes hacer no se muestra, y no se explica. Se
            pregunta con el MISMO predicado del destino, para que el enlace no pueda prometer
            lo que la otra pantalla niega. */}
        {puedeVerResearch ? (
          <Link href="/research/new" className="nn-button">
            {t("createProtocolButton")}
          </Link>
        ) : null}
      </p>

      <section className="nn-section">
        <h2>{t("protocolListHeading")}</h2>
        <form style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <input type="text" name="variable" defaultValue={variable ?? ""} placeholder={t("filterByVariablePlaceholder")} />
          <BotonDeEnvio className="nn-button">
            {t("filterButton")}
          </BotonDeEnvio>
          {variable ? <Link href="/research">{t("filterAllButton")}</Link> : null}
        </form>

        {protocols.length === 0 ? (
          <p className="nn-muted">{t("noProtocols")}</p>
        ) : (
          <div className="nn-grid">
            {protocols.map((protocol) => (
              <Link key={protocol.id} href={`/research/${protocol.id}`} className="nn-card-link">
                <h3>{protocol.name}</h3>
                {protocol.externalIdentifier ? <p className="nn-muted">{protocol.externalIdentifier}</p> : null}
                <p className="nn-detail-meta">
                  {protocol.versions.map((v) => (
                    <span key={v.id}>
                      v{v.version} ({v.status})
                    </span>
                  ))}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
