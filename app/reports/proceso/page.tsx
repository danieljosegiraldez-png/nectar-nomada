/**
 * El reporte transversal: proceso → tueste → puntaje.
 *
 * **Lo que hace distinto a este reporte de una tabla vacía.** Medido el
 * 2026-09-07 contra la copia de producción, la cadena está entera en el esquema
 * y **sin un solo dato**: 45 lotes, 0 procesos, 0 tuestes, 0 valoraciones. Un
 * `<table>` sin filas se lee como «no hay nada que ver». Por eso lo primero que
 * se pinta es **qué eslabón falta**, en números: «45 lotes, 0 con proceso» dice
 * lo que de verdad pasa, que es trabajo por registrar.
 *
 * **No guarda nada.** Lee y agrupa. Un derivado persistido se queda viejo en
 * silencio, y CLAUDE.md §28 obliga a que un derivado declare su método — más
 * fácil no persistirlo.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { reporteDeProceso } from "../../../lib/traceability/reporteDeProceso";

export const dynamic = "force-dynamic";

export default async function ReporteDeProcesoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  const { filas, faltan, porProceso, porGrado } = await reporteDeProceso(user.userAccountId);

  const guion = "—";

  return (
    <div>
      <Link href="/lots" className="nn-back-link">
        {t("backToLots")}
      </Link>
      <h1>{t("processReportHeading")}</h1>
      <p className="nn-muted">{t("processReportIntro")}</p>

      <section className="nn-section">
        <h2>{t("processReportMissingHeading")}</h2>
        <div className="nn-detail-meta">
          <span>{t("processReportLotsVisible", { n: faltan.lotesVisibles })}</span>
          <span>{t("processReportLotsWithProcess", { n: faltan.lotesConProceso })}</span>
          <span>{t("processReportClosed", { n: faltan.procesosCerrados })}</span>
          <span>{t("processReportWithRoast", { n: faltan.procesosConTueste })}</span>
          <span>{t("processReportWithScore", { n: faltan.procesosConPuntaje })}</span>
        </div>
        {filas.length === 0 ? <p className="nn-muted">{t("processReportNothingYet")}</p> : null}
      </section>

      {/* El grado va ANTES que la receta: es lo que el dueño quiere comparar —
          sus naturales contra sus honeys— mientras que la receta es cómo se
          llama el procedimiento. */}
      {porGrado.length > 0 ? (
        <section className="nn-section">
          <h2>{t("processReportByGradeHeading")}</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="nn-table">
              <thead>
                <tr>
                  <th>{t("processReportColGrade")}</th>
                  <th>{t("processReportColRows")}</th>
                  <th>{t("processReportColAvgScore")}</th>
                </tr>
              </thead>
              <tbody>
                {porGrado.map((g) => (
                  <tr key={g.grado}>
                    <td>{g.grado}</td>
                    <td>{g.filas}</td>
                    <td>{g.puntajePromedio ?? guion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {porProceso.length > 0 ? (
        <section className="nn-section">
          <h2>{t("processReportByProcessHeading")}</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="nn-table">
              <thead>
                <tr>
                  <th>{t("processReportColProcess")}</th>
                  <th>{t("processReportColRows")}</th>
                  <th>{t("processReportColAvgScore")}</th>
                </tr>
              </thead>
              <tbody>
                {porProceso.map((g) => (
                  <tr key={g.etiqueta}>
                    <td>{g.etiqueta}</td>
                    <td>{g.filas}</td>
                    {/* `null` se pinta como guión, nunca como 0: un 0 es un
                        puntaje y la ausencia de puntajes no lo es. */}
                    <td>{g.puntajePromedio ?? guion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {filas.length > 0 ? (
        <section className="nn-section">
          <h2>{t("processReportRowsHeading")}</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="nn-table">
              <thead>
                <tr>
                  <th>{t("processReportColLot")}</th>
                  <th>{t("processReportColGrade")}</th>
                  <th>{t("processReportColCherry")}</th>
                  <th>{t("processReportColProcess")}</th>
                  <th>{t("processReportColIntent")}</th>
                  <th>{t("processReportColMoisture")}</th>
                  <th>{t("processReportColVarietals")}</th>
                  <th>{t("processReportColRoast")}</th>
                  <th>{t("processReportColScores")}</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.lotProcessId}>
                    <td>
                      <Link href={`/lots/${f.lotId}/process`} className="nn-code">
                        {f.lotCode}
                      </Link>
                      {f.sequenceOrder > 1 ? ` · ${f.sequenceOrder}` : ""}
                    </td>
                    <td>{f.gradoDeProceso}</td>
                    <td>{f.estadoDeCereza}</td>
                    <td>{f.etiqueta}</td>
                    <td>{f.intent}</td>
                    <td className={(f.diferenciaContraObjetivo ?? 0) > 0 ? "nn-error" : undefined}>
                      {f.humedadDeCierre === null
                        ? t("processReportStillOpen", { target: f.targetMoisturePct })
                        : t("processReportMoistureCell", {
                            closed: f.humedadDeCierre,
                            target: f.targetMoisturePct,
                            diff: (f.diferenciaContraObjetivo ?? 0).toFixed(2),
                          })}
                    </td>
                    <td>{f.varietales.length > 0 ? f.varietales.join(", ") : guion}</td>
                    <td>{f.perfilesDeTueste.length > 0 ? f.perfilesDeTueste.join(", ") : guion}</td>
                    <td>
                      {f.puntajes.length > 0
                        ? t("processReportScoresCell", { avg: f.puntajePromedio ?? 0, n: f.puntajes.length })
                        : guion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="nn-muted">{t("processReportMethodNote")}</p>
        </section>
      ) : null}
    </div>
  );
}
