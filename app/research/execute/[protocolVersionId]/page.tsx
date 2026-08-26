import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getProtocolVersionDetail } from "../../../../lib/research/protocols";
import { getLotList } from "../../../../lib/traceability/lots";
import { ResearchAccessError } from "../../../../lib/research/access";
import { TreatmentBatchForm } from "../../../components/research/TreatmentBatchForm";

export const dynamic = "force-dynamic";

export default async function ExecuteProtocolPage({ params }: { params: Promise<{ protocolVersionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { protocolVersionId } = await params;
  const t = await getTranslations("Research");

  let version;
  try {
    version = await getProtocolVersionDetail(user.userAccountId, protocolVersionId);
  } catch (error) {
    if (error instanceof ResearchAccessError) notFound();
    throw error;
  }
  // Only the ids feed a picker here, so truncation has no notice to render;
  // the cap is the same one /lots reports (ADR-087).
  const { items: lots } = await getLotList(user.userAccountId);

  return (
    <div>
      <Link href={`/research/${version.protocolId}`} className="nn-back-link">
        {t("backToResearch")}
      </Link>
      <h1>{t("executeHeading")}</h1>
      <p className="nn-muted">
        {version.protocol.name} — {t("versionLabel")} {version.version}
      </p>

      <TreatmentBatchForm
        protocolVersionId={version.id}
        variables={version.variables.map((v) => ({
          id: v.id,
          name: v.name,
          valueType: v.valueType,
          unit: v.unit,
          enumValues: v.enumValues,
          catalog: v.catalog ? { values: v.catalog.values } : null,
        }))}
        lots={lots.map((lot) => ({ id: lot.id, lotCode: lot.lotCode }))}
      />
    </div>
  );
}
