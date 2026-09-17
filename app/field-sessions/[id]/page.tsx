import Link from "next/link";
import { rutaDelSitio } from "../../../lib/navigation";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getFieldSessionTimeline, LocationAccessError } from "../../../lib/traceability/fieldSessions";
import { FieldSessionValidationError } from "../../../lib/traceability/fieldSessions";
import { getObserverCandidates } from "../../../lib/traceability/lots";
import { getFieldEventKinds } from "../../../lib/traceability/fieldSessionCatalog";
import { FieldEventForm, FieldSessionEndForm } from "../../components/traceability/FieldSessionForms";
import { EmitirReporteForm, CompletarVisitaForm, VitalesEnSitioForm } from "../../components/traceability/ReporteDeVisitaForms";
import { leerReporteDeVisita } from "../../../lib/traceability/reporteDeVisita";
import { resumenDeVisita } from "../../../lib/apiary/bitacora";
import { pendientesDeLaVisita } from "../../../lib/apiary/pendienteDeLaVisita";
import { FieldSyncControls } from "../../components/traceability/FieldSyncControls";
import { mostrarInstante } from "../../../lib/time/mostrarInstante";

export const dynamic = "force-dynamic";

/**
 * Fecha y hora en el mismo formato en toda la página, sin inventar precisión.
 *
 * Antes esto era `d.toISOString().slice(0, 16)`, que siempre devuelve UTC.
 * Medido el 2026-09-05 en un móvil con datos reales: una jornada abierta a las
 * 07:30 se titulaba «12:30» y un evento anotado a las 11:31 se listaba a las
 * «16:31». El instante guardado era correcto —comprobado contra la base— y lo
 * que mentía era la pantalla. Cinco horas, en el campo, sobre el dato que ES el
 * registro. Ver `lib/time/mostrarInstante.ts`.
 */
const cuando = (d: Date, zona: string | null | undefined) => mostrarInstante(d, zona);

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

  // Si ya se emitió, se ofrece el enlace al informe además del botón: volver a
  // emitir crea una VERSIÓN nueva —lo emitido no se reescribe— y eso está bien,
  // pero quien sólo quiere leerlo no debería tener que emitir otra vez.
  const reporteEmitido = await leerReporteDeVisita(user.userAccountId, id).catch(() => null);

  // Anexo E §5 — «Al cerrarla: resumen de lo registrado, lo que quedó pendiente». Las dos
  // mitades faltaban en la pantalla: `resumenDeVisita` existe desde A9.1 y no aparecía en
  // NINGUNA pantalla —alimentaba un mensaje de bitácora y nada más— y de lo pendiente no
  // había nada. Las dos lecturas van en paralelo y ninguna autoriza: este componente ya pasó
  // por `getFieldSessionTimeline`.
  const [resumen, pendiente] = await Promise.all([
    resumenDeVisita(id),
    pendientesDeLaVisita(id),
  ]);

  const enCurso = session.endedAt == null;

  return (
    <div>
      <p className="nn-detail-meta">
        {/* Anexo E §1 — la vuelta va a la pantalla QUE LE CORRESPONDE al sitio. Enlazaba a
            `/plots` siempre, así que una jornada de apiario mandaba a la pantalla de parcelas
            de café y desde la jornada no había forma de llegar a las colmenas. La consulta ya
            traía `locationType`: el arreglo no cuesta una consulta más. */}
        <Link href={rutaDelSitio(session.location.locationType, session.locationId)}>
          {t("fieldSessionBackToLocation", { name: session.location.name })}
        </Link>
      </p>

      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("fieldSessionTitle", { location: session.location.name, date: cuando(session.startedAt, session.location.timezone) })}</h1>
      <p className="nn-detail-meta">
        {t("fieldSessionOperatorLabel")}: {session.operator.displayName}
        {" · "}
        {enCurso ? <strong>{t("fieldSessionOpen")}</strong> : t("fieldSessionClosedAt", { date: cuando(session.endedAt!, session.location.timezone) })}
      </p>
      {/* A qué se fue. Vacío es «sin registrar» y se dice: las visitas anteriores al
          2026-09-15 no traen ninguno porque nadie lo preguntó, no porque no tuvieran
          propósito. */}
      <p className={session.purposes.length === 0 ? "nn-vital-sin-registro" : "nn-detail-meta"}>
        {session.purposes.length === 0
          ? t("visitPurposesSinRegistrar")
          : t("visitPurposesLine", {
              purposes: session.purposes.map((p) => t(`visitPurpose_${p}`)).join(", "),
            })}
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
                <strong>{e.eventKindValue.value}</strong> · {cuando(e.occurredAt, session.location.timezone)}
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

      {/* **Lo que queda por tocar, MIENTRAS la jornada sigue abierta.** El Anexo lo pide «al
          cerrarla», y aquí aparece también antes por una razón: una lista de lo que te falta
          que sólo sale cuando ya no puedes añadir eventos es una lista que no se puede
          atender. Al cerrar se sigue enseñando, como registro de lo que se dejó. */}
      {pendiente && pendiente.sinTocar.length > 0 ? (
        <section className="nn-section">
          <h2>{t("pendienteHeading")}</h2>
          <p className="nn-detail-meta">
            {t("pendienteResumen", {
              tocadas: pendiente.tocadas,
              total: pendiente.tocadas + pendiente.sinTocar.length,
              pobladas: pendiente.sinTocarPobladas,
            })}
          </p>
          <ul className="nn-detail-meta">
            {pendiente.sinTocar.map((c) => (
              <li key={c.hiveId}>
                {c.identifier}
                {c.poblada ? "" : ` · ${t("pendienteSinColonia")}`}
              </li>
            ))}
          </ul>
          {/* Las tiras sin retirar: material que sigue dentro de una caja de este sitio. Es
              lo otro que todavía se puede resolver sin subir al carro. */}
          {pendiente.retiros.length > 0 ? (
            <p className="nn-alerta nn-alerta-aviso">
              {t("pendienteRetiros", { count: pendiente.retiros.length })}
            </p>
          ) : null}
        </section>
      ) : null}

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
            {/* P4 §11 — la cola vive junto al formulario que la llena, no en
                una pantalla aparte: quien anota sin señal es quien tiene que
                ver que lo suyo sigue sin enviarse. */}
            <FieldSyncControls />
          </section>

          {/* ADR-156 — los vitales de campo, anotados ESTANDO AQUÍ. Van ANTES de «terminar la
              visita» a propósito: se ven al llegar y al recorrer, no al irse. Y salen sólo mientras
              la visita está abierta, porque eso es justo lo que la marca afirma. */}
          <section className="nn-section">
            <h2>{t("vitalesEnSitioHeading")}</h2>
            <p className="nn-muted">
              {session.fieldVitalsOnSiteAt
                ? t("vitalesEnSitioMarca", {
                    fecha: cuando(session.fieldVitalsOnSiteAt, session.location.timezone),
                  })
                : t("vitalesEnSitioSinMarca")}
            </p>
            <VitalesEnSitioForm fieldSessionId={session.id} />
          </section>

          <section className="nn-section">
            <h2>{t("fieldSessionEndHeading")}</h2>
            <FieldSessionEndForm fieldSessionId={session.id} />
          </section>
        </>
      ) : (
        // Cerrada: no se añaden eventos ni se reabre. El servicio ya lo rechaza
        // (`session_already_ended`); la página no ofrece lo que sería rechazado.
        //
        // **Y aquí va el informe**, que hasta el 2026-09-10 no tenía puerta:
        // `emitirReporteDeVisita` existía y no lo llamaba nadie, así que ir al
        // informe de una visita cerrada daba 404. Va en esta rama porque el
        // servicio exige la visita completada — ofrecerlo antes sería pintar un
        // botón que va a fallar.
        <>
          <p className="nn-muted">{t("fieldSessionClosedNoMoreEvents")}</p>

          {/* «Resumen de lo registrado» — la primera mitad del §5. La función existía desde
              A9.1 y no la llamaba ninguna pantalla. */}
          {resumen ? (
            <section className="nn-section">
              <h2>{t("resumenHeading")}</h2>
              <p className="nn-detail-meta">
                {t("resumenCifras", {
                  inspecciones: resumen.resumen.inspecciones,
                  eventos: resumen.resumen.eventosDeColonia,
                  cosechas: resumen.resumen.cosechas,
                })}
              </p>
            </section>
          ) : null}
          {/* **El paso que faltaba, y el orden que importa.** `endedAt` dice
              cuándo se salió del sitio; `completedAt`, cuándo se terminó de
              escribir (A9.1 D4). Emitir el informe exige lo segundo, y nada lo
              ponía: el botón de emitir contestaba «cierra la visita» justo
              después de cerrarla. */}
          {session.status === "draft" ? (
            <section className="nn-section">
              <h2>{t("visitCompleteHeading")}</h2>
              <CompletarVisitaForm fieldSessionId={session.id} />
            </section>
          ) : (
            <section className="nn-section">
              <h2>{t("reportEmitHeading")}</h2>
              {reporteEmitido ? (
                <p>
                  <Link href={`/field-sessions/${session.id}/report`}>{t("reportOpenLink")}</Link>
                </p>
              ) : null}
              <EmitirReporteForm fieldSessionId={session.id} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
