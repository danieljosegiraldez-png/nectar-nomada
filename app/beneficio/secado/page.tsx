import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { colaDeSecado, type UnidadEnCola } from "../../../lib/beneficio/colaDeSecado";
import { NavegacionBeneficio } from "../../components/beneficio/NavegacionBeneficio";
import { registrarTandaFormAction } from "../../actions/traceability";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";

export const dynamic = "force-dynamic";

/**
 * La cola de secado: qué hay en cada área y qué le toca a cada unidad.
 *
 * **Es la pantalla de inicio del operario de secado** (Daniel, 2026-09-27): «ver muchos procesos o
 * secados y manejos y no perder ojo al detalle». Diseño en
 * `docs/superpowers/specs/2026-09-27-cola-de-secado-y-ritmo-por-fase-design.md` §B.1.
 *
 * **El estado va con palabras, no sólo con color.** En el patio se mira a pleno sol y con las manos
 * sucias, y un matiz no sobrevive — la misma regla que ya gobierna la pantalla de equipos y el
 * inventario. El color acompaña; la palabra es la que informa.
 *
 * **Lo que esta pantalla todavía NO hace**, dicho para no prometer de más: no registra el volteo ni
 * la medición. Los dos actos —«revolví éstas» como tanda, y «medir» con el formulario en cascada— son
 * las piezas siguientes del diseño. Aquí sólo se lee.
 */
const COLOR: Record<UnidadEnCola["estado"], string> = {
  "al dia": "var(--nn-muted, #6f7780)",
  "le toca volteo": "var(--nn-warn, #a8741a)",
  "debe lectura": "var(--nn-warn, #a8741a)",
  "va tarde": "var(--nn-danger, #8c2f2a)",
  "cerca del objetivo": "var(--nn-accent, #1d6f6a)",
  listo: "var(--nn-accent, #1d6f6a)",
  "sin receta declarada": "var(--nn-muted, #6f7780)",
  "receta sin ritmo de secado": "var(--nn-muted, #6f7780)",
  // Tarea 9, ronda de arreglo 1: no se sabe qué proceso lo cubre, y alguien tiene que mirarlo a mano.
  "linaje demasiado hondo": "var(--nn-warn, #a8741a)",
};

const horas = (h: number | null) => (h == null ? "—" : h < 1 ? "<1 h" : `${Math.round(h)} h`);

export default async function ColaDeSecadoPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [t, cola, { ok, error }] = await Promise.all([
    getTranslations("Secado"),
    colaDeSecado(user.userAccountId),
    searchParams,
  ]);

  return (
    <div className="nn-mill-page">
      <header className="nn-mill-header">
        <div>
          <h1>{t("colaTitulo")}</h1>
          <p>{t("colaIntro")}</p>
        </div>
      </header>
      <NavegacionBeneficio userAccountId={user.userAccountId} actual="/beneficio/secado" />

      {/* El resultado del acto anterior. `ok` trae CUÁNTAS corridas se voltearon, no cuántas
          casillas se marcaron: dos bandejas de un mismo lote son una corrida, y decir «2» cuando
          se escribió 1 sería mentir en la dirección que nadie comprueba. */}
      {ok === undefined ? null : (
        <p className="nn-notice nn-notice-success" role="status">{t("colaTandaHecha", { corridas: Number(ok) })}</p>
      )}
      {error ? (
        <p className="nn-error" role="alert">
          {error === "tanda_vacia" ? t("colaTandaVacia") : t("colaTandaSinPermiso")}
        </p>
      ) : null}

      {/* «No puedes ver ninguna» no es «no hay ninguna»: una cuenta recién dada de alta leería que el
          beneficio no tiene café secándose. Son dos mensajes distintos a propósito. */}
      {cola.sinAmbito ? (
        <p className="nn-muted" role="status">
          {t("colaSinAmbito")}
        </p>
      ) : cola.areas.length === 0 ? (
        <p className="nn-muted" role="status">
          {t("colaSinSecados")}
        </p>
      ) : (
        <form action={registrarTandaFormAction}>
          {cola.areas.map((area) => (
          <section key={area.locationId} className="nn-section" aria-labelledby={`area-${area.locationId}`}>
            <h2 id={`area-${area.locationId}`}>{area.nombre}</h2>
            <p className="nn-muted">
              {t("colaResumenArea", {
                unidades: area.unidades.length,
                volteo: area.unidades.filter((u) => u.estado === "le toca volteo").length,
                listos: area.unidades.filter((u) => u.estado === "listo").length,
              })}
            </p>

            <div style={{ overflowX: "auto" }}>
              <table className="nn-table" style={{ fontVariantNumeric: "tabular-nums" }}>
                <thead>
                  <tr>
                    {/* Sin rótulo visible: la columna son casillas y cada una lleva su
                        `aria-label` con el nombre de su unidad, que es lo que un lector de
                        pantalla necesita. El repositorio no tiene clase para texto oculto
                        —comprobado— y no se inventa una para un encabezado que nadie ve. */}
                    <th scope="col" />
                    <th scope="col">{t("colaColumnaUnidad")}</th>
                    <th scope="col">{t("colaColumnaLote")}</th>
                    <th scope="col">{t("colaColumnaProceso")}</th>
                    <th scope="col">{t("colaColumnaDia")}</th>
                    <th scope="col">{t("colaColumnaVolteo")}</th>
                    <th scope="col">{t("colaColumnaHumedad")}</th>
                    <th scope="col">{t("colaColumnaEstado")}</th>
                  </tr>
                </thead>
                <tbody>
                  {area.unidades.map((u) => (
                    <tr key={u.clave}>
                      <td>
                        {/* Marcada de antemano si le toca volteo: el operario DESMARCA lo que no
                            tocó, en vez de marcar lo que sí. Es la diferencia entre confirmar y
                            rellenar, y en el patio con las manos sucias se nota.
                            El `value` es la CORRIDA, no la unidad: dos bandejas hermanas mandan el
                            mismo valor y la acción lo deduplica. Ver su cabecera. */}
                        <input
                          type="checkbox"
                          name="corrida"
                          value={u.dryingRunId}
                          defaultChecked={u.estado === "le toca volteo"}
                          aria-label={t("colaCasillaDe", { unidad: u.nombre })}
                          style={{ width: "26px", height: "26px" }}
                        />
                      </td>
                      <th scope="row">{u.nombre}</th>
                      <td>
                        <Link href={`/lots/${u.lotId}`} className="nn-code">
                          {u.lotCode}
                        </Link>
                      </td>
                      <td>{u.proceso ?? t("colaSinProceso")}</td>
                      <td>
                        {/* Con duración declarada se dice «día 4 de 8»; sin ella, sólo las horas que
                            lleva — porque prometer un día «de 8» que nadie declaró sería inventarlo. */}
                        {u.ritmo.expectedHours == null
                          ? t("colaDiaSinDeclarar", { horas: Math.round(u.horasEnFase) })
                          : t("colaDiaDe", {
                              dia: Math.max(1, Math.ceil(u.horasEnFase / 24)),
                              de: Math.max(1, Math.ceil(u.ritmo.expectedHours / 24)),
                            })}
                      </td>
                      <td>
                        {u.ultimoVolteo == null
                          ? t("colaSinVoltear")
                          : t("colaVolteoHace", { horas: horas(u.horasSinVoltear), veces: u.volteos })}
                      </td>
                      <td>
                        {u.humedadPct == null
                          ? t("colaSinHumedad")
                          : u.ritmo.humedadMinPct == null || u.ritmo.humedadMaxPct == null
                            ? `${u.humedadPct} %`
                            : t("colaHumedadConRango", {
                                pct: u.humedadPct,
                                min: u.ritmo.humedadMinPct,
                                max: u.ritmo.humedadMaxPct,
                              })}
                      </td>
                      <td>
                        <span
                          style={{
                            border: `1px solid ${COLOR[u.estado]}`,
                            color: COLOR[u.estado],
                            borderRadius: "2px",
                            padding: "0.15rem 0.45rem",
                            fontSize: "0.82em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t(`colaEstado_${u.estado.replace(/ /g, "_")}` as "colaEstado_al_dia")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          ))}

          {/* Un solo botón para toda la pantalla, y va al final: la tanda es UN acto sobre lo que
              esté marcado, aunque sea de dos áreas distintas. Un botón por área partiría en dos
              lo que el operario hizo de una pasada. */}
          <div style={{ marginTop: "1rem" }}>
            <BotonDeEnvio className="nn-button">{t("colaBotonVolvi")}</BotonDeEnvio>
            <p className="nn-muted" style={{ marginTop: "0.35rem" }}>
              {t("colaBotonAyuda")}
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
