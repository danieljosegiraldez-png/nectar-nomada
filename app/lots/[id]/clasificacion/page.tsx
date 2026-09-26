import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getLotSummary, TraceabilityAccessError } from "../../../../lib/traceability/lots";
import { compararClasificacionVerde } from "../../../../lib/traceability/clasificacionVerde";

export const dynamic = "force-dynamic";

/**
 * La lectura 3 de la spec del 2026-09-25: comparar lotes entre sí.
 *
 * **Fuera de la ficha, y por una razón medida.** `app/lots/[id]/page.tsx` pasa de las 1.400 líneas
 * y una veintena de secciones, y un `<details>` en un componente de servidor no ahorra la consulta:
 * el contenido se renderiza aunque esté plegado. Metida allí, esta consulta —que recorre todos los
 * lotes verdes visibles— correría en cada carga de cada lote verde, la mire alguien o no.
 */
export default async function ComparacionDeClasificacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let lote;
  try {
    lote = await getLotSummary(user.userAccountId, id);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) notFound();
    throw error;
  }

  const comparacion = await compararClasificacionVerde(user.userAccountId);

  return (
    <div>
      <Link href={`/lots/${id}`} className="nn-back-link">{t("backToLot", { lotCode: lote.lotCode })}</Link>
      <h1>{t("compararMallaTitulo")}</h1>
      <p className="nn-muted">{t("compararMallaIntro")}</p>

      {/* «No puedes ver ninguno» no es «no hay ninguno», y una tabla vacía diría lo segundo. */}
      {comparacion.sinAmbito ? (
        <p role="status">{t("compararMallaSinAmbito")}</p>
      ) : comparacion.filas.length === 0 ? (
        <p className="nn-muted">{t("compararMallaVacio")}</p>
      ) : (
        <table className="nn-table" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr>
              <th scope="col">{t("compararMallaColumnaLote")}</th>
              <th scope="col">{t("compararMallaColumnaFecha")}</th>
              <th scope="col">{t("compararMallaColumnaEntrada")}</th>
              {comparacion.columnas.map((c) => (
                <th key={c.clave} scope="col">
                  {c.sinRango ? t("compararMallaSinRango") : `${c.rangoMin ?? "?"}–${c.rangoMax ?? "?"}`}
                  {c.sistema ? <span className="nn-muted"> · {c.sistema}</span> : null}
                </th>
              ))}
              <th scope="col">{t("compararMallaColumnaDefectos")}</th>
              <th scope="col">{t("compararMallaColumnaDato")}</th>
            </tr>
          </thead>
          <tbody>
            {comparacion.filas.map((f) => (
              // El resaltado lo pone la PANTALLA, que es la que sabe desde qué lote la miran: la
              // función de lectura no recibe ningún lotId y no tiene por qué.
              <tr key={f.lotId} aria-current={f.lotId === id ? "true" : undefined}>
                <th scope="row">
                  <Link href={`/lots/${f.lotId}`} className="nn-code">{f.lotCode}</Link>
                  {/* `aria-current` no lo lee quien mira la pantalla, sólo quien la escucha. */}
                  {f.lotId === id ? <span className="nn-muted"> · {t("compararMallaEsteLote")}</span> : null}
                </th>
                <td>{f.clasificadoEl.toISOString().slice(0, 10)}</td>
                <td>{f.entradaKg} kg</td>
                {comparacion.columnas.map((c) => {
                  const pct = f.repartoPct[c.clave];
                  return (
                    <td key={c.clave}>
                      {/* Columna ausente = este lote no sacó esa malla. No es un 0 medido. */}
                      {pct == null ? "—" : t("selectionOutturnShare", { share: pct })}
                    </td>
                  );
                })}
                <td>{f.defectosPct != null ? t("selectionOutturnShare", { share: f.defectosPct }) : "—"}</td>
                <td>
                  {f.estadoDelDato
                    ? t(`estadoDelDato_${f.estadoDelDato}` as "estadoDelDato_measured")
                    : t("selectionOutturnUnknown")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {comparacion.truncado ? <p className="nn-muted">{t("compararMallaTruncado", { limit: comparacion.limite })}</p> : null}
      {!comparacion.sinAmbito && comparacion.sinClasificar > 0 ? (
        <p className="nn-muted">{t("compararMallaSinClasificar", { count: comparacion.sinClasificar })}</p>
      ) : null}
    </div>
  );
}
