import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getFieldSessionTimeline, LocationAccessError } from "../../../lib/traceability/fieldSessions";
import { FieldSessionValidationError } from "../../../lib/traceability/fieldSessions";
import { getObserverCandidates } from "../../../lib/traceability/lots";
import { getFieldEventKinds } from "../../../lib/traceability/fieldSessionCatalog";
import { FieldEventForm, FieldSessionEndForm } from "../../components/traceability/FieldSessionForms";

export const dynamic = "force-dynamic";

/** Fecha y hora en el mismo formato en toda la página, sin inventar precisión. */
const cuando = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

/**
 * Una jornada de campo: la visita, y lo que pasó dentro.
 *
 * Existe porque una visita a un apiario que revisa cuatro colmenas se guardaba
 * como cuatro inspecciones sueltas, sin nada que dijera que fueron la misma
 * salida — y así es como están escritos los reportes de visita del dueño.
 *
 * La jornada **no reemplaza** a la inspección ni al evento de colonia: los
 * agrupa. Un `FieldEvent` puede apuntar a una medición, una foto o una muestra
 * ya registradas, así que lo que aquí se ve es el hilo de la visita, no una
 * copia de sus partes.
 */
export default async function FieldSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");

  let timeline;
  try {
    timeline = await getFieldSessionTimeline(user.userAccountId, id);
  } catch (error) {
    // Una jornada que no se puede leer es, para quien mira, una jornada que no
    // está. Distinguir «no existe» de «no te toca» confirmaría que existe.
    if (error instanceof LocationAccessError || error instanceof FieldSessionValidationError) notFound();
    throw error;
  }

  const { session, events } = timeline;
  const [{ people, selfPersonId }, eventKinds] = await Promise.all([
    getObserverCandidates(user.userAccountId),
    getFieldEventKinds(),
  ]);

  const enCurso = session.endedAt == null;

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href={`/plots/${session.locationId}`}>{t("fieldSessionBackToLocation", { name: session.location.name })}</Link>
      </p>

      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("fieldSessionTitle", { location: session.location.name, date: cuando(session.startedAt) })}</h1>
      <p className="nn-detail-meta">
        {t("fieldSessionOperatorLabel")}: {session.operator.displayName}
        {" · "}
        {enCurso ? <strong>{t("fieldSessionOpen")}</strong> : t("fieldSessionClosedAt", { date: cuando(session.endedAt!) })}
      </p>
      {session.notes ? <p className="nn-muted">{session.notes}</p> : null}
      {session.startLatitude != null && session.startLongitude != null ? (
        <p className="nn-detail-meta">
          {t("coordinatesLegend")}: {session.startLatitude.toFixed(5)}, {session.startLongitude.toFixed(5)}
          {session.startAccuracyM != null ? ` (±${Math.round(session.startAccuracyM)} m)` : ""}
        </p>
      ) : null}

      <section className="nn-section">
        <h2>{t("fieldEventsHeading")}</h2>
        {events.length === 0 ? (
          <p className="nn-muted">{t("fieldEventsNone")}</p>
        ) : (
          <ol className="nn-detail-meta">
            {events.map((e) => (
              <li key={e.id}>
                <strong>{e.eventKindValue.value}</strong> · {cuando(e.occurredAt)}
                {/* El operador del evento sólo se nombra cuando difiere del de
                    la jornada; repetirlo en cada línea sería ruido. */}
                {e.operator && e.operator.id !== session.operatorPersonId ? ` · ${e.operator.displayName}` : ""}
                {e.latitude != null && e.longitude != null
                  ? ` · ${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}`
                  : ""}
                {e.notes ? ` — ${e.notes}` : ""}
              </li>
            ))}
          </ol>
        )}
      </section>

      {enCurso ? (
        <>
          <section className="nn-section">
            <h2>{t("fieldEventAddHeading")}</h2>
            <FieldEventForm
              fieldSessionId={session.id}
              eventKinds={eventKinds}
              people={people.map((p) => ({ id: p.id, displayName: p.displayName }))}
              selfPersonId={selfPersonId}
            />
          </section>

          <section className="nn-section">
            <h2>{t("fieldSessionEndHeading")}</h2>
            <FieldSessionEndForm fieldSessionId={session.id} />
          </section>
        </>
      ) : (
        // Cerrada: no se añaden eventos ni se reabre. El servicio ya lo rechaza
        // (`session_already_ended`); la página no ofrece lo que sería rechazado.
        <p className="nn-muted">{t("fieldSessionClosedNoMoreEvents")}</p>
      )}
    </div>
  );
}
