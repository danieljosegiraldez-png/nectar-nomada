import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { leerReporteDeVisita } from "../../../../lib/traceability/reporteDeVisita";
import { LocationAccessError } from "../../../../lib/traceability/fieldSessions";
import { PrintButton } from "../../../components/traceability/PrintButton";

export const dynamic = "force-dynamic";

/**
 * A9.6 (D7) — el reporte de una visita, listo para imprimir.
 *
 * **Se renderiza desde el SNAPSHOT, no desde la visita.** Es la propiedad
 * entera de la decisión: un reporte emitido no cambia porque los datos se
 * corrijan después. Esta página no consulta `FieldSession` ni `FieldEvent`;
 * consulta lo que se congeló al emitir.
 *
 * **Sin librería de PDF, a propósito.** `@media print` ya existe en
 * `app/globals.css` desde el reporte de lote (T13/ADR-039) y esconde la
 * navegación, los formularios y los botones. La página web ES la plantilla:
 * una plantilla de PDF aparte se separa de la web en el primer cambio, y este
 * documento lo va a leer un cliente de finca en un teléfono, donde que se vea
 * igual en pantalla y en papel es justo lo que importa.
 */
export default async function ReporteDeVisitaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");

  let reporte;
  try {
    reporte = await leerReporteDeVisita(user.userAccountId, id);
  } catch (error) {
    if (error instanceof LocationAccessError) notFound();
    throw error;
  }
  if (!reporte) notFound();

  const { snapshot } = reporte;

  return (
    <div>
      <p className="nn-back-link">
        <Link href={`/field-sessions/${id}`}>{t("fieldSessionBackLink")}</Link>
      </p>

      <div className="nn-report-actions">
        <PrintButton />
      </div>

      <h1>{snapshot.sitio.nombre}</h1>
      <p className="nn-detail-meta">
        {/* La versión y la fecha de emisión van en la cara del documento: un
            reporte que no dice cuál es no se puede citar en una conversación. */}
        {t("reportVersionLine", { version: reporte.version, emitido: snapshot.emitidoEn })}
      </p>

      <section className="nn-section">
        <h2>{t("reportVisitHeading")}</h2>
        <ul className="nn-detail-meta">
          <li>{t("reportVisitStart", { cuando: snapshot.visita.inicio })}</li>
          {snapshot.visita.fin ? <li>{t("reportVisitEnd", { cuando: snapshot.visita.fin })}</li> : null}
          <li>{t("reportVisitOperator", { quien: snapshot.visita.operador })}</li>
        </ul>
        {snapshot.visita.notas ? <p>{snapshot.visita.notas}</p> : null}
      </section>

      <section className="nn-section">
        <h2>{t("reportRecordsHeading", { count: snapshot.registros.length })}</h2>
        {snapshot.registros.length === 0 ? (
          <p className="nn-muted">{t("reportNoRecords")}</p>
        ) : (
          <ul className="nn-detail-meta">
            {snapshot.registros.map((r, i) => (
              <li key={i}>
                {r.cuando} · {r.clase}
                {r.sujeto ? ` · ${r.sujeto}` : ""}
                {r.operador ? ` · ${r.operador}` : ""}
                {r.notas ? ` — ${r.notas}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
