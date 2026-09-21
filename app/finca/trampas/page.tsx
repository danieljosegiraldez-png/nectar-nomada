import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { cookies } from "next/headers";
import { getFincaTrampas, FincaTrapAccessError } from "../../../lib/traceability/fincaTrampas";
import { COOKIE_FINCA, fincaDeLaPagina } from "../../../lib/traceability/fincas";
import { agruparTrampasPorParcela, type GrupoDeLote } from "../../../lib/traceability/agrupacionDeTrampas";
import { FincaElegida } from "../../components/traceability/FincaElegida";
import { estadoDeTrampa, trampasParaAviso, trampasFiltradas, FILTROS_DE_TRAMPAS } from "../../../lib/traceability/pendienteDeTrampas";
import { claveDeTituloDeBloque } from "../../../lib/traceability/plotBlocks";
import { diaDeHoy } from "../../../lib/time/diaDeHoy";

export const dynamic = "force-dynamic";

/**
 * Las trampas de UNA finca — spec §4.1 —, la que se está trabajando en la sección Finca.
 *
 * **Corregido el 2026-09-21, por Daniel recorriéndola en producción.** Llevaba su propio
 * selector por `?finca=` que, para quien ve varias fincas —un administrador las ve todas—,
 * enumeraba todas, con o sin trampas. Él: sólo la finca a la que pertenece, «its not a
 * generalized system». Ahora usa la finca elegida de la sección (`fincaDeLaPagina`, la misma
 * cookie que `/finca`), y si no hay una elegida manda una vez a `/fincas`. Y las trampas ya no
 * van en una tabla plana: van por parcela → sus microparcelas → sus bloques
 * (`agruparTrampasPorParcela`).
 *
 * `getFincaTrampas` sigue siendo la autoridad de acceso: si la finca elegida no tiene ningún
 * lote cuyas trampas pueda ver quien mira, lanza `FincaTrapAccessError` y se dice (spec §6).
 */
export default async function TrampasDeLaFincaPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  // **La finca de la sección, no un listado de fincas.** Daniel, 2026-09-21, recorriendo esta
  // pantalla en producción: sólo la finca a la que pertenece, «not name of other farms». Antes
  // llevaba su propio selector (`?finca=`) que, para quien ve varias —un administrador las ve
  // todas—, enumeraba todas las fincas. Ahora usa la misma finca elegida que `/finca`
  // (`fincaDeLaPagina` y su cookie), y si no hay una elegida manda a escogerla una vez.
  const finca = await fincaDeLaPagina(user.userAccountId, (await cookies()).get(COOKIE_FINCA)?.value);
  if (finca.fincas.length === 0) {
    return <p className="nn-error" role="alert">{t("fincaTrapsNoAnyAccess")}</p>;
  }
  if (!finca.elegida) redirect("/fincas?volver=/finca/trampas");
  const farmLocationId = finca.elegida.siteId;

  const { filtro: filtroCrudo } = await searchParams;

  let detalle;
  try {
    detalle = await getFincaTrampas(user.userAccountId, farmLocationId);
  } catch (error) {
    if (error instanceof FincaTrapAccessError) {
      return <p className="nn-error" role="alert">{t("fincaTrapsNoAccess")}</p>;
    }
    throw error;
  }

  // A7 fix-final (I1) — la zona REAL de la finca, no el respaldo UTC−12: es
  // la misma fuente que ya usa `/plots/[id]` para el vencimiento
  // (`location.timezone`) y que la ronda usa para su campo de fecha. Antes
  // esta pantalla y la ronda usaban el respaldo aunque `detalle.farmTimezone`
  // ya estaba disponible, así que una misma trampa podía reportar «al día»
  // aquí y «toca revisar» en `/plots/[id]` durante la ventana de la mañana en
  // que las dos zonas discrepan. Las tres pantallas tienen que coincidir.
  const hoy = diaDeHoy(new Date(), detalle.farmTimezone);

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

  // El enlace de la regla apunta al primer lote accesible de esta finca — `detalle.plots` nunca está vacío
  // aquí, porque `getFincaTrampas` habría lanzado si lo estuviera.
  const primerLote = detalle.plots[0] ?? null;
  const hrefRegla = primerLote ? `/plots/${primerLote.id}/ajustes#regla-trampas` : null;

  function hrefConFiltro(filtro: string | null): string {
    const params = new URLSearchParams();
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
      <FincaElegida elegida={finca.elegida} hayVarias={finca.fincas.length > 1} volver="/finca/trampas" />
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
        // Por parcela → sus microparcelas → sus bloques (Daniel, 2026-09-21). Se agrupa lo que
        // queda tras el filtro, así que «toca revisar» enseña sólo las parcelas donde toca.
        agruparTrampasPorParcela(detalle.plots, visibles).map((grupo) => (
          <SeccionDeLote key={grupo.lote.id} grupo={grupo} nivel={2} t={t} />
        ))
      )}
    </div>
  );
}

type Traducir = Awaited<ReturnType<typeof getTranslations<"Traceability">>>;
type TrampaConEstado = Awaited<ReturnType<typeof getFincaTrampas>>["trampas"][number] & { estado: string };

/** Una parcela (o microparcela): su nombre, sus trampas por bloque, y dentro sus microparcelas. */
function SeccionDeLote({ grupo, nivel, t }: { grupo: GrupoDeLote<TrampaConEstado>; nivel: 2 | 3; t: Traducir }) {
  const Titulo = nivel === 2 ? "h2" : "h3";
  return (
    <section className="nn-section">
      <Titulo>
        <Link href={`/plots/${grupo.lote.id}?pestana=trampas`}>{grupo.lote.name}</Link>
      </Titulo>
      {grupo.bloques.map((b) => {
        const claveBloque = b.bloque ? claveDeTituloDeBloque(b.bloque.blockType) : null;
        return (
          <div key={b.plotBlockId ?? "sin-bloque"}>
            <p className="nn-detail-meta">
              {b.bloque ? (claveBloque ? t(claveBloque, { name: b.bloque.name }) : b.bloque.name) : t("trapsNoBlock")}
            </p>
            <table className="nn-table">
              <thead>
                <tr>
                  <th>{t("trapsNumber", { n: "" })}</th>
                  <th>{t("trapsColumnLastCheck")}</th>
                  <th>{t("trapsColumnLastReading")}</th>
                  <th>{t("trapsColumnStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {b.trampas.map((trampa) => (
                  <tr key={trampa.id}>
                    <td>{trampa.trapNumber ?? t("notRecorded")}</td>
                    <td>{trampa.ultimaRevision ? trampa.ultimaRevision.observedAt.toISOString().slice(0, 10) : t("trapsNeverChecked")}</td>
                    <td>{trampa.ultimaRevision?.brocaLevel ? t(`trapsLevel_${trampa.ultimaRevision.brocaLevel}`) : t("notRecorded")}</td>
                    <td>{t(`trapEstado_${trampa.estado}` as "trapEstado_al_dia")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {/* A cualquier profundidad: cortar aquí haría desaparecer las trampas de una microparcela
          dentro de otra. El título no baja de h3 para no deshacer la jerarquía de la página. */}
      {grupo.microparcelas.map((m) => <SeccionDeLote key={m.lote.id} grupo={m} nivel={3} t={t} />)}
    </section>
  );
}
