import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getPlotDetail } from "../../../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../../../lib/traceability/locations";
import { SoilSampleForm, FoliarSampleForm } from "../../../../components/traceability/SampleForms";

export const dynamic = "force-dynamic";

/** Añadir una muestra de suelo o foliar — spec §3. Vuelve a la pestaña Muestras. */
export default async function NuevaMuestraPage({ params }: { params: Promise<{ id: string }> }) {
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
        <Link href={`/plots/${id}?pestana=muestras`}>{t("plotDashboardBackLink")}</Link>
      </p>
      <h1>{t("samplesSoilAdd")}</h1>
      <SoilSampleForm locationId={detail.location.id} volverA={`/plots/${id}?pestana=muestras`} />
      <h1>{t("samplesFoliarAdd")}</h1>
      <FoliarSampleForm locationId={detail.location.id} volverA={`/plots/${id}?pestana=muestras`} />
    </div>
  );
}
