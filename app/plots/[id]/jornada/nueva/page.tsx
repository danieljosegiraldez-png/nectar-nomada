import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getPlotDetail } from "../../../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../../../lib/traceability/locations";
import { getObserverCandidates } from "../../../../../lib/traceability/lots";
import { FieldSessionStartForm } from "../../../../components/traceability/FieldSessionForms";

export const dynamic = "force-dynamic";

/** Abrir una jornada — spec de vistas de finca y parcela §3: el formulario no cambia, se
 * muda fuera del tablero. Vuelve a la pestaña Resumen, de donde se llega. */
export default async function NuevaJornadaPage({ params }: { params: Promise<{ id: string }> }) {
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
        <Link href={`/plots/${id}?pestana=resumen`}>{t("plotDashboardBackLink")}</Link>
      </p>
      <h1>{t("fieldSessionStartSummary")}</h1>
      <FieldSessionStartForm
        locationId={detail.location.id}
        people={people}
        selfPersonId={selfPersonId}
      />
    </div>
  );
}
