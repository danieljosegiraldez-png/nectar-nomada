import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getPlotDetail } from "../../../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../../../lib/traceability/locations";
import { SoilProfileForm } from "../../../../components/traceability/SoilProfileForm";

export const dynamic = "force-dynamic";

/** Describir una calicata nueva — spec §3. Vuelve a la pestaña Condiciones. */
export default async function NuevaCalicataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let detail;
  try {
    detail = await getPlotDetail(user.userAccountId, id);
  } catch (error) {
    if (error instanceof LocationAccessError) notFound();
    throw error;
  }

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href={`/plots/${id}?pestana=condiciones`}>{t("plotDashboardBackLink")}</Link>
      </p>
      <h1>{t("soilDescribeHeading")}</h1>
      <SoilProfileForm
        locationId={detail.location.id}
        values={{
          describedAt: null, pitDepthCm: null, rootingDepthCm: null, rootDistribution: null,
          mottling: null, greyColours: null, rootChannelConcretions: null, sourSmell: null,
          impedingLayerDepthCm: null, impedingLayerNote: null, provenanceClass: "",
          dataQuality: null, notes: null,
        }}
        volverA={`/plots/${id}?pestana=condiciones`}
      />
    </div>
  );
}
