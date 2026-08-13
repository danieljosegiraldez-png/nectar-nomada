import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getProtocolDetail, listVariableCatalogs } from "../../../lib/research/protocols";
import { ResearchAccessError } from "../../../lib/research/access";
import { ProtocolVersionForm } from "../../components/research/ProtocolVersionForm";
import { ActivateVersionForm } from "../../components/research/ActivateVersionForm";

export const dynamic = "force-dynamic";

export default async function ProtocolDetailPage({ params }: { params: Promise<{ protocolId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { protocolId } = await params;
  const t = await getTranslations("Research");

  let protocol;
  try {
    protocol = await getProtocolDetail(user.userAccountId, protocolId);
  } catch (error) {
    if (error instanceof ResearchAccessError) notFound();
    throw error;
  }
  const catalogs = await listVariableCatalogs(user.userAccountId);

  return (
    <div>
      <Link href="/research" className="nn-back-link">
        {t("backToResearch")}
      </Link>
      <h1>{protocol.name}</h1>
      {protocol.externalIdentifier ? <p className="nn-muted">{protocol.externalIdentifier}</p> : null}
      {protocol.description ? <p>{protocol.description}</p> : null}

      <section className="nn-section">
        <h2>{t("versionsHeading")}</h2>
        {protocol.versions.map((version) => (
          <div key={version.id} className="nn-card-link" style={{ cursor: "default", marginBottom: "1rem" }}>
            <h3>
              {t("versionLabel")} {version.version} — {version.status}
            </h3>

            <h4 style={{ marginTop: "0.75rem" }}>{t("variablesHeading")}</h4>
            {version.variables.length === 0 ? (
              <p className="nn-muted">—</p>
            ) : (
              <ul>
                {version.variables.map((v) => (
                  <li key={v.id}>
                    {v.name} ({v.valueType}
                    {v.catalog ? `: ${v.catalog.name}` : ""}
                    {v.valueType === "closed_enum" ? `: ${v.enumValues.join(", ")}` : ""}
                    {v.unit ? `, ${v.unit}` : ""})
                    {v.isControlled ? ` — ${t("variableControlledLabel")}` : ""}
                  </li>
                ))}
              </ul>
            )}

            <h4>{t("requiredMeasurementsHeading")}</h4>
            {version.requiredMeasurements.length === 0 ? (
              <p className="nn-muted">—</p>
            ) : (
              <ul>
                {version.requiredMeasurements.map((rm) => (
                  <li key={rm.id}>
                    {rm.variable ?? rm.catalog?.name} @ {rm.atProcessingStage}
                  </li>
                ))}
              </ul>
            )}

            <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
              {version.status !== "active" ? (
                <ActivateVersionForm protocolId={protocol.id} protocolVersionId={version.id} />
              ) : null}
              <Link href={`/research/execute/${version.id}`} className="nn-button" style={{ textDecoration: "none", fontSize: "0.85rem", padding: "0.25rem 0.6rem" }}>
                {t("executeButton")}
              </Link>
            </div>
          </div>
        ))}
      </section>

      <section className="nn-section">
        <h2>{t("createVersionButton")}</h2>
        <ProtocolVersionForm protocolId={protocol.id} catalogs={catalogs} />
      </section>
    </div>
  );
}
