import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ClasificacionDeLote } from "../../../lib/traceability/clasificacionVerde";

/**
 * Las lecturas 1 y 2 de la spec del 2026-09-25: el reparto por malla y los defectos agrupados.
 *
 * **Sustituye** a la tabla genérica de cuajado en un lote verde, no se añade a ella: las mismas
 * cifras en dos formatos en la misma pantalla es cómo se acaba con dos números que no cuadran. Y
 * «aceptado / rechazado» es el vocabulario de la selección de cereza, no el de un tamizado.
 */
export async function ClasificacionPorMalla({
  clasificacion,
  lotId,
}: {
  clasificacion: ClasificacionDeLote;
  lotId: string;
}) {
  const t = await getTranslations("Traceability");
  const share = (pct: number | null) =>
    pct != null ? t("selectionOutturnShare", { share: pct }) : t("selectionOutturnUnknown");

  return (
    <section className="nn-section">
      <h2>{t("clasificacionMallaHeading")}</h2>
      <p className="nn-muted">
        {t("clasificacionMallaEntrada")}: {clasificacion.entradaKg} kg
      </p>

      <table className="nn-table" style={{ fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr>
            <th>{t("clasificacionMallaColumnaMalla")}</th>
            <th>{t("clasificacionMallaColumnaSistema")}</th>
            <th>{t("clasificacionMallaColumnaDato")}</th>
            <th>{t("clasificacionMallaColumnaPeso")}</th>
            <th>{t("clasificacionMallaColumnaShare")}</th>
          </tr>
        </thead>
        <tbody>
          {clasificacion.mallas.map((m) => (
            <tr key={m.lotId}>
              <td>
                <Link href={`/lots/${m.lotId}`} className="nn-code">{m.lotCode}</Link>{" "}
                {/* «Sin declarar» no es «malla 0»: se dice con palabras, no con un cero. */}
                {m.sinRango ? t("clasificacionMallaSinRango") : `${m.rangoMin ?? "?"}–${m.rangoMax ?? "?"}`}
                {m.uniformidadPct != null ? ` · ${t("clasificacionMallaUniformidad", { pct: m.uniformidadPct })}` : ""}
              </td>
              <td>{m.sistema ?? t("selectionOutturnUnknown")}</td>
              <td>{t(`estadoDelDato_${m.estado}` as "estadoDelDato_measured")}</td>
              <td>{m.kg} kg</td>
              <td>{share(m.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{t("clasificacionMallaDefectosHeading")}</h3>
      {clasificacion.defectos.length === 0 ? (
        <p className="nn-muted">{t("clasificacionMallaSinDefectos")}</p>
      ) : (
        <table className="nn-table" style={{ fontVariantNumeric: "tabular-nums" }}>
          <tbody>
            {clasificacion.defectos.map((d) => (
              <tr key={d.categoriaValueId}>
                <td>{d.categoria ?? t("selectionOutturnUnknown")}</td>
                <td className="nn-muted">{t("clasificacionMallaDefectoLotes", { count: d.lotes.length })}</td>
                <td>{d.kg} kg</td>
                <td>{share(d.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <table className="nn-table" style={{ fontVariantNumeric: "tabular-nums" }}>
        <tbody>
          <tr>
            <td>{t("clasificacionMallaMerma")}</td>
            <td>{clasificacion.mermaDeclaradaKg != null ? `${clasificacion.mermaDeclaradaKg} kg` : t("selectionOutturnUnknown")}</td>
          </tr>
          <tr>
            {/* null es «desconocido», nunca 0 — ADR-080, la misma distinción que la tabla de cereza. */}
            <td>{t("clasificacionMallaSinExplicar")}</td>
            <td>{clasificacion.noExplicadoKg != null ? `${clasificacion.noExplicadoKg} kg` : t("selectionOutturnUnknown")}</td>
          </tr>
        </tbody>
      </table>

      <p>
        <Link href={`/lots/${lotId}/clasificacion`}>{t("clasificacionMallaComparar")}</Link>
      </p>
    </section>
  );
}
