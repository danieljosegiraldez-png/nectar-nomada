import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getFincasConTrampas, getFincaTrampas, FincaTrapAccessError, elegirFincaDeTrampas } from "../../../lib/traceability/fincaTrampas";
import { estadoDeTrampa, trampasParaAviso, trampasFiltradas, FILTROS_DE_TRAMPAS } from "../../../lib/traceability/pendienteDeTrampas";
import { claveDeTituloDeBloque } from "../../../lib/traceability/plotBlocks";
import { diaDeHoy } from "../../../lib/time/diaDeHoy";

export const dynamic = "force-dynamic";

/**
 * Todas las trampas de una finca — spec §4.1. Sin `[farmId]` en la ruta: hoy hay una
 * sola finca operativa, y esta pantalla se resuelve sola cuando sólo hay una
 * accesible (mismo patrón que `destinoDeEntrada` con un único apiario,
 * `lib/navigation.ts`). Con más de una, ofrece un selector por `?finca=`.
 *
 * Fix round 1 (revisión de la Tarea 8):
 * - `?finca=` ya no se comprueba contra `fincas` antes de usarse: se manda tal
 *   cual a `getFincaTrampas`, que es la autoridad (Tarea 7) y ya lo revalida.
 *   Así la rama `FincaTrapAccessError` deja de ser código muerto — es lo que
 *   responde a una finca concreta que el visor no puede ver, spec §6.
 * - Sin NINGÚN acceso, ya no hay `notFound()`: el mensaje explícito de spec §6.
 *
 * Fix round 1 (Tarea 9, ruling del controlador): la elección de finca se movió a
 * `elegirFincaDeTrampas` (`lib/traceability/fincaTrampas.ts`), que también usa la
 * ronda — una sola implementación en vez de dos copias con el mismo criterio.
 */
export default async function TrampasDeLaFincaPage({
  searchParams,
}: {
  searchParams: Promise<{ finca?: string; filtro?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const fincas = await getFincasConTrampas(user.userAccountId);
  if (fincas.length === 0) {
    return <p className="nn-error" role="alert">{t("fincaTrapsNoAnyAccess")}</p>;
  }

  const { finca: fincaElegida, filtro: filtroCrudo } = await searchParams;
  const farmLocationId = elegirFincaDeTrampas(fincas, fincaElegida);

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

  // El estado de cada trampa se calcula una sola vez: la tabla lo muestra y el
  // filtro lo usa para decidir qué fila queda.
  const conEstado = detalle.trampas.map((trampa) => ({
    ...trampa,
    estado: estadoDeTrampa({
      hoy,
      trampa: trampasParaAviso([trampa])[0]!,
      regla: detalle.reglaDeTrampas,
    }).estado,
  }));
  const visibles = trampasFiltradas(conEstado, filtroCrudo);

  // El enlace de la regla conserva `?finca=` cuando la URL lo traía; y apunta al
  // primer lote accesible de esta finca — `detalle.plots` nunca está vacío
  // aquí, porque `getFincaTrampas` habría lanzado si lo estuviera.
  const primerLote = detalle.plots[0] ?? null;
  const hrefRegla = primerLote ? `/plots/${primerLote.id}/ajustes#regla-trampas` : null;

  function hrefConFiltro(filtro: string | null): string {
    const params = new URLSearchParams();
    if (fincaElegida) params.set("finca", fincaElegida);
    if (filtro) params.set("filtro", filtro);
    const qs = params.toString();
    return qs ? `/finca/trampas?${qs}` : "/finca/trampas";
  }

  const filtroActivo = filtroCrudo && (FILTROS_DE_TRAMPAS as readonly string[]).includes(filtroCrudo)
    ? filtroCrudo
    : null;

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
          {hrefRegla ? <> · <Link href={hrefRegla}>{t("trapRuleChangeLink")}</Link></> : null}
        </p>
      ) : (
        <p className="nn-muted">
          {t("trapRuleNone")}
          {hrefRegla ? <> · <Link href={hrefRegla}>{t("trapRuleConfigureLink")}</Link></> : null}
        </p>
      )}

      <nav className="nn-tabs" aria-label={t("trapsFilterLabel")}>
        <Link
          href={hrefConFiltro(null)}
          aria-current={filtroActivo == null ? "page" : undefined}
          className={filtroActivo == null ? "nn-tab nn-tab-activa" : "nn-tab"}
        >
          {t("trapsFilterAll")}
        </Link>
        <Link
          href={hrefConFiltro("toca_revisar")}
          aria-current={filtroActivo === "toca_revisar" ? "page" : undefined}
          className={filtroActivo === "toca_revisar" ? "nn-tab nn-tab-activa" : "nn-tab"}
        >
          {t("trapEstado_toca_revisar")}
        </Link>
        <Link
          href={hrefConFiltro("lectura_alta")}
          aria-current={filtroActivo === "lectura_alta" ? "page" : undefined}
          className={filtroActivo === "lectura_alta" ? "nn-tab nn-tab-activa" : "nn-tab"}
        >
          {t("trapEstado_lectura_alta")}
        </Link>
      </nav>

      {visibles.length === 0 ? (
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
            {visibles.map((trampa) => {
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
                  <td>{t(`trapEstado_${trampa.estado}` as "trapEstado_al_dia")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
