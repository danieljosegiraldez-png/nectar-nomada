import { fechaDelReporte, detalleDelReporte } from "../../../../lib/traceability/presentacionDelReporte";
import { DetallesDelReporte } from "../../../components/traceability/DetallesDelReporte";
import { seManejaEnCuadros } from "../../../../lib/apiary/sitioDeAbejas";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { leerReporteDeVisita, enlacesPublicadosDeVisita } from "../../../../lib/traceability/reporteDeVisita";
import { LocationAccessError } from "../../../../lib/traceability/fieldSessions";
import { PrintButton } from "../../../components/traceability/PrintButton";
import { PublicarEnlaceForm, EnlacesPublicados } from "../../../components/traceability/ReporteDeVisitaForms";

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
  const ta = await getTranslations("Apiary");

  let reporte;
  try {
    reporte = await leerReporteDeVisita(user.userAccountId, id);
  } catch (error) {
    if (error instanceof LocationAccessError) notFound();
    throw error;
  }
  if (!reporte) notFound();

  // Los enlaces ya entregados, para poder cortarlos. Va después del `notFound`:
  // sin informe emitido no hay enlaces que listar.
  const enlaces = await enlacesPublicadosDeVisita(user.userAccountId, id);

  const { snapshot } = reporte;

  return (
    <div>
      <p className="nn-back-link">
        <Link href={`/field-sessions/${id}`}>{t("fieldSessionBackLink")}</Link>
      </p>

      <div className="nn-report-actions">
        <PrintButton />
      </div>

      {/* **El enlace para el supervisor, que no tenía puerta.**
          `publicarReporteConEnlace` existía desde A9.6 y no lo llamaba nadie:
          se podía emitir un token por código y no había dónde canjearlo.
          `nn-no-print` porque esto es una acción, no parte del documento. */}
      <section className="nn-section nn-no-print">
        <h2>{t("reportLinkHeading")}</h2>
        <PublicarEnlaceForm fieldSessionId={id} />
        <EnlacesPublicados fieldSessionId={id} enlaces={enlaces} />
      </section>

      <h1>{snapshot.sitio.nombre}</h1>
      <p className="nn-detail-meta">
        {/* La versión y la fecha de emisión van en la cara del documento: un
            reporte que no dice cuál es no se puede citar en una conversación. */}
        {t("reportVersionLine", { version: reporte.version, emitido: fechaDelReporte(snapshot.emitidoEn, snapshot.sitio.zona) })}
      </p>

      <section className="nn-section">
        <h2>{t("reportVisitHeading")}</h2>
        <ul className="nn-detail-meta">
          <li>{t("reportVisitStart", { cuando: fechaDelReporte(snapshot.visita.inicio, snapshot.sitio.zona) })}</li>
          {snapshot.visita.fin ? <li>{t("reportVisitEnd", { cuando: fechaDelReporte(snapshot.visita.fin, snapshot.sitio.zona) })}</li> : null}
          <li>{t("reportVisitOperator", { quien: snapshot.visita.operador })}</li>
        </ul>
        {snapshot.visita.notas ? <p>{snapshot.visita.notas}</p> : null}
      </section>
      {/* La lectura del técnico y lo que le recomienda al cliente — Anexo E §5 y §7: se
          escriben en casa, y son por lo que el cliente paga el servicio. Opcionales porque lo
          emitido antes del 2026-09-15 no las trae. */}
      {snapshot.causaProbable ? (
        <section className="nn-section">
          <h2>{t("reportCauseHeading")}</h2>
          <p>{snapshot.causaProbable}</p>
        </section>
      ) : null}
      {snapshot.recomendacion ? (
        <section className="nn-section">
          <h2>{t("reportRecommendationHeading")}</h2>
          <p>{snapshot.recomendacion}</p>
        </section>
      ) : null}
      {/* Los viáticos sólo viajan en el snapshot si el contrato los pidió. */}
      {snapshot.viaticosUsd ? (
        <p className="nn-detail-meta">{t("reportTravelCost", { monto: snapshot.viaticosUsd })}</p>
      ) : null}


      <section className="nn-section">
        <h2>{t("reportRecordsHeading", { count: snapshot.registros.length })}</h2>
        {snapshot.registros.length === 0 ? (
          <p className="nn-muted">{t("reportNoRecords")}</p>
        ) : (
          <ul className="nn-detail-meta">
            {snapshot.registros.map((r, i) => (
              <li key={i}>
                {/* **La colmena va primero, y en negrita.** Es lo que el cliente sigue: un
                    informe que dice «inspección» sin decir de cuál caja es un listado de
                    tipos de fila. Los reportes emitidos ANTES del 2026-09-15 no la traen —el
                    snapshot es inmutable y no se reescribe—, así que el campo puede faltar y
                    la línea se dibuja igual. */}
                {r.colmena ? <strong>{r.colmena}</strong> : null}
                {r.colmena ? " · " : ""}
                {fechaDelReporte(r.cuando, snapshot.sitio.zona)} · {r.clase}
                {r.detalle ? ` · ${detalleDelReporte(r, ta)}` : ""}
                {r.sujeto ? ` · ${r.sujeto}` : ""}
                {r.operador ? ` · ${r.operador}` : ""}
                {r.notas ? ` — ${r.notas}` : ""}
                <DetallesDelReporte registro={r} enCuadros={seManejaEnCuadros(snapshot.sitio.tipo)} paraCliente={false} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
