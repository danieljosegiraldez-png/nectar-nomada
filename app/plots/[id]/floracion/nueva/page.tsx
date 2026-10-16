import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getObserverCandidates, TraceabilityAccessError } from "../../../../../lib/traceability/lots";
import { bloquesDeLaParcela, contextoDeManejo } from "../../../../../lib/traceability/intervenciones";
import { diaDeHoy } from "../../../../../lib/time/diaDeHoy";
import { FloracionForm } from "../../../../components/traceability/FloracionForms";

export const dynamic = "force-dynamic";

/**
 * Anotar una floración — decisión de Daniel, 2026-10-16. Hasta hoy el aviso de polinizadores de
 * «Manejo» existía y no podía dispararse: nada registraba una floración (SESSION_STATE §3).
 *
 * Se autoriza como la página de manejo, con `contextoDeManejo` (`lot:view`), y no con
 * `getPlotDetail`, que exige `location:manage_attributes` y dejaría fuera al operario. Guardar exige
 * `lot:manage`, y eso lo comprueba el servicio.
 */
export default async function NuevaFloracionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let location;
  try {
    location = await contextoDeManejo(user.userAccountId, id);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) notFound();
    throw error;
  }

  const [{ people, selfPersonId }, bloques] = await Promise.all([
    getObserverCandidates(user.userAccountId, [{ locationId: id }]),
    bloquesDeLaParcela(user.userAccountId, id),
  ]);

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href={`/plots/${location.id}`}>{t("manejoBackToPlot")}</Link>
      </p>
      <h1>{t("floracionNuevaTitulo")}</h1>
      <p className="nn-detail-meta">{location.name}</p>
      <p className="nn-muted">{t("floracionPorQue")}</p>

      <FloracionForm
        locationId={location.id}
        hoy={diaDeHoy(new Date(), location.timezone)}
        bloques={bloques}
        personas={people}
        selfPersonId={selfPersonId}
      />
    </div>
  );
}
