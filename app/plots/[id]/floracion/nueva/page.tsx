import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import {
  DEFAULT_NEW_RECORD_CLASSIFICATION,
  getObserverCandidates,
  puedeGestionarLote,
  TraceabilityAccessError,
} from "../../../../../lib/traceability/lots";
import { bloquesDeLaParcela, contextoDeManejo } from "../../../../../lib/traceability/intervenciones";
import { diaDeHoy } from "../../../../../lib/time/diaDeHoy";
import { ZONA_POR_DEFECTO } from "../../../../../lib/time/mostrarInstante";
import { FloracionForm } from "../../../../components/traceability/FloracionForm";

export const dynamic = "force-dynamic";

/**
 * Registrar una floración — F1. El servicio (`registrarFloracion`) existía desde el 2026-10-01 sin
 * ninguna pantalla, así que el aviso de polinizadores de `/manejo/nuevo` estaba construido e
 * inalcanzable: nadie podía anotar una floración para que avisara.
 *
 * Se lee con `contextoDeManejo` (`lot:view`), como la pantalla de manejo, y se ofrece sólo a quien
 * puede registrar: el mismo `lot:manage` que exige el servicio, preguntado con `puedeGestionarLote`.
 * Quien no puede no ve el botón en la portada, y si llega aquí por la dirección, la página no existe
 * para él (decisión de Daniel del 2026-09-27: lo que no puedes hacer no se ofrece).
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
  if (!(await puedeGestionarLote(user.userAccountId, { locationId: id, classification: DEFAULT_NEW_RECORD_CLASSIFICATION }))) {
    notFound();
  }

  const [bloques, { people, selfPersonId }] = await Promise.all([
    bloquesDeLaParcela(user.userAccountId, id),
    getObserverCandidates(user.userAccountId, [{ locationId: id }]),
  ]);
  // Sólo el valor inicial del campo de inicio. Con la zona de respaldo y no con «el día más
  // temprano del planeta» que `diaDeHoy` usa sin zona: aquí no se afirma nada, se propone un día
  // que el operario cambia si no es el suyo.
  const hoy = diaDeHoy(new Date(), location.timezone ?? ZONA_POR_DEFECTO);

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href={`/plots/${location.id}`}>← {location.name}</Link>
      </p>
      <h1>{t("floracionNuevaTitulo")}</h1>
      <p className="nn-muted">{t("floracionNuevaIntro")}</p>
      <FloracionForm locationId={location.id} bloques={bloques} personas={people} selfPersonId={selfPersonId} hoy={hoy} />
    </div>
  );
}
