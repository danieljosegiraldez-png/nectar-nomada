import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getPlotDetail } from "../../../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../../../lib/traceability/locations";
import { getObserverCandidates } from "../../../../../lib/traceability/lots";
import { LandPhotoUploadForm } from "../../../../components/traceability/LandPhotoUploadForm";

export const dynamic = "force-dynamic";

/** Añadir una fotografía general de la parcela — fix round 1 de la Tarea 6
 * (spec §3: «ningún formulario queda dentro del tablero»). El formulario no
 * cambia, se muda; vuelve a la pestaña Fotos. La foto de una calicata
 * concreta se queda en la pestaña Condiciones, colgando de esa calicata. */
export default async function NuevaFotoPage({ params }: { params: Promise<{ id: string }> }) {
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
  const { people, selfPersonId } = await getObserverCandidates(user.userAccountId, [{ locationId: id }]);

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href={`/plots/${id}?pestana=fotos`}>{t("plotDashboardBackLink")}</Link>
      </p>
      <h1>{t("addPhotoButton")}</h1>
      <LandPhotoUploadForm
        locationId={detail.location.id}
        parent={{ kind: "location" }}
        observers={people}
        selfPersonId={selfPersonId}
        volverA={`/plots/${id}?pestana=fotos`}
      />
    </div>
  );
}
