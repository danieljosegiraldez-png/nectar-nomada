import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getFincasConTrampas, getFincaTrampas, FincaTrapAccessError } from "../../../lib/traceability/fincaTrampas";
import { estadoDeTrampa, trampasParaAviso } from "../../../lib/traceability/pendienteDeTrampas";
import { claveDeTituloDeBloque } from "../../../lib/traceability/plotBlocks";
import { diaDeHoy } from "../../../lib/time/diaDeHoy";

export const dynamic = "force-dynamic";

/**
 * Todas las trampas de una finca — spec §4.1. Sin `[farmId]` en la ruta: hoy hay una
 * sola finca operativa, y esta pantalla se resuelve sola cuando sólo hay una
 * accesible (mismo patrón que `destinoDeEntrada` con un único apiario,
 * `lib/navigation.ts`). Con más de una, ofrece un selector por `?finca=`.
 */
export default async function TrampasDeLaFincaPage({
  searchParams,
}: {
  searchParams: Promise<{ finca?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const fincas = await getFincasConTrampas(user.userAccountId);
  if (fincas.length === 0) notFound();

  const { finca: fincaElegida } = await searchParams;
  const farmLocationId = fincaElegida && fincas.some((f) => f.id === fincaElegida)
    ? fincaElegida
    : fincas.length === 1 ? fincas[0]!.id : null;

  if (farmLocationId == null) {
    return (
      <div>
        <h1>{t("fincaTrapsTitle")}</h1>
        <ul>
          {fincas.map((f) => (
            <li key={f.id}><Link href={`/finca/trampas?finca=${f.id}`}>{f.name}</Link></li>
          ))}
        </ul>
      </div>
    );
  }

  let detalle;
  try {
    detalle = await getFincaTrampas(user.userAccountId, farmLocationId);
  } catch (error) {
    if (error instanceof FincaTrapAccessError) {
      return <p className="nn-error" role="alert">{t("fincaTrapsNoAccess")}</p>;
    }
    throw error;
  }

  const hoy = diaDeHoy(new Date(), null);

  return (
    <div>
      <p className="nn-detail-meta"><Link href="/finca">{t("plotDashboardBackLink")}</Link></p>
      <h1>{t("fincaTrapsTitleNamed", { name: detalle.farmName })}</h1>
      <p>
        <Link href="/finca/trampas/ronda" className="nn-button">{t("trapsGoToRoundLink")}</Link>
      </p>

      {detalle.reglaDeTrampas ? (
        <p className="nn-detail-meta">
          {t("trapRuleCurrent", {
            lectura: t(`trapsLevel_${detalle.reglaDeTrampas.triggerLevel}`),
            normal: detalle.reglaDeTrampas.normalDays,
            alerta: detalle.reglaDeTrampas.alertDays,
            accion: detalle.reglaDeTrampas.suggestedAction,
          })}
        </p>
      ) : (
        <p className="nn-muted">{t("trapRuleNone")}</p>
      )}

      {detalle.trampas.length === 0 ? (
        <p className="nn-muted">{t("trapsNone")}</p>
      ) : (
        <table className="nn-table">
          <thead>
            <tr>
              <th>{t("trapsNumber", { n: "" })}</th>
              <th>{t("trapsColumnPlot")}</th>
              <th>{t("trapsColumnBlock")}</th>
              <th>{t("trapsColumnLastCheck")}</th>
              <th>{t("trapsColumnLastReading")}</th>
              <th>{t("trapsColumnStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {detalle.trampas.map((trampa) => {
              const { estado } = estadoDeTrampa({
                hoy,
                trampa: trampasParaAviso([trampa])[0]!,
                regla: detalle.reglaDeTrampas,
              });
              const claveBloque = trampa.bloque ? claveDeTituloDeBloque(trampa.bloque.blockType) : null;
              return (
                <tr key={trampa.id}>
                  <td>{trampa.trapNumber ?? t("notRecorded")}</td>
                  <td><Link href={`/plots/${trampa.plotId}?pestana=trampas`}>{trampa.plotName}</Link></td>
                  <td>
                    {trampa.bloque
                      ? claveBloque ? t(claveBloque, { name: trampa.bloque.name }) : trampa.bloque.name
                      : t("trapsNoBlock")}
                  </td>
                  <td>{trampa.ultimaRevision ? trampa.ultimaRevision.observedAt.toISOString().slice(0, 10) : t("trapsNeverChecked")}</td>
                  <td>{trampa.ultimaRevision?.brocaLevel ? t(`trapsLevel_${trampa.ultimaRevision.brocaLevel}`) : t("notRecorded")}</td>
                  <td>{t(`trapEstado_${estado}` as "trapEstado_al_dia")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
