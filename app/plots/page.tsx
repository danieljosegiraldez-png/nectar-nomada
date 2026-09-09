import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { getManageableContext } from "../../lib/traceability/lots";

export const dynamic = "force-dynamic";

export default async function PlotsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  const { plotLocations } = await getManageableContext(user.userAccountId);

  /**
   * Qué condiciones tiene registradas una parcela. Se calcula una vez y se usa
   * dos: para el recuento de arriba y para la tarjeta, en vez de repetir la
   * misma cadena de `!= null` en los dos sitios y que deriven.
   */
  const condiciones = (p: (typeof plotLocations)[number]) =>
    [
      p.sunExposure && "sun",
      p.shadePercentage && "shade",
      (p.altitudeMinM ?? p.altitudeMaxM) != null && "altitude",
      p.slopeDescription && "slope",
      p.aspect && "aspect",
      p.soilType && "soil",
    ].filter(Boolean).length;

  // **Lo que falta, en números y antes de la lista** — el mismo criterio que
  // `/reports/proceso`. Medido el 2026-09-08 sobre la finca real: de 8
  // parcelas, **0 tienen area y 0 tienen una sola condicion**. Sin este
  // recuento la pagina son ocho tarjetas identicas salvo el nombre, y quien la
  // abre no sabe si eso es «no hay nada que ver» o «falta registrarlo todo».
  const conArea = plotLocations.filter((p) => p.areaHectares != null).length;
  const conCondiciones = plotLocations.filter((p) => condiciones(p) > 0).length;

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("plotsTitle")}</h1>
      <p className="nn-muted">{t("plotsIntro")}</p>

      {/* El biochar se produce en la finca y se aplica al terreno, así que se
          llega desde aquí y no desde la barra superior: `navigation.test.ts`
          exige que el menú más privilegiado quepa en un móvil (≤8 entradas), y
          esa regla tiene razón — una sección de registro puntual no compite
          con Lotes, Parcelas o Investigación por un sitio ahí arriba.

          (Ese «≤8» es hoy una afirmación falsa: `NAV` tiene 10 entradas y el
          fixture del test es una lista de permisos escrita a mano que no llega
          a abrirlas todas. Está anotado en `SESSION_STATE.md` §3; la decisión
          de acortar el menú o mover el objetivo sigue siendo del dueño.) */}
      <p>
        <Link href="/biochar">{t("biocharTitle")}</Link>
      </p>

      {plotLocations.length > 0 ? (
        <p className="nn-detail-meta">
          <span>{t("plotsCount", { n: plotLocations.length })}</span>{" "}
          <span>{t("plotsWithArea", { n: conArea })}</span>{" "}
          <span>{t("plotsWithConditions", { n: conCondiciones })}</span>
        </p>
      ) : null}

      <section className="nn-section">
        {plotLocations.length === 0 ? (
          <p className="nn-muted">{t("noPlots")}</p>
        ) : (
          <div className="nn-grid">
            {plotLocations.map((plot) => {
              const hasConditions = condiciones(plot) > 0;

              return (
                <Link key={plot.id} href={`/plots/${plot.id}`} className="nn-card-link">
                  <h3>{plot.name}</h3>
                  {plot.organization ? <p className="nn-detail-meta">{plot.organization.name}</p> : null}

                  {/* **El área sólo se pinta si la hay.** Con 0 de 8 parcelas
                      con área, «Área: Sin registrar» se repetía ocho veces y no
                      decía nada que el recuento de arriba no diga mejor. Lo que
                      falta se cuenta una vez; no se recita por tarjeta. */}
                  {plot.areaHectares != null ? (
                    <p className="nn-detail-meta">
                      {t("areaLabel")}: {t("areaValue", { hectares: Number(plot.areaHectares) })}
                    </p>
                  ) : null}

                  {hasConditions ? (
                    <dl className="nn-detail-meta">
                      {plot.sunExposure ? (
                        <p>
                          {t("sunExposureLabel")}: {t(`sunExposure_${plot.sunExposure}` as "sunExposure_full_sun")}
                        </p>
                      ) : null}
                      {plot.shadePercentage ? (
                        <p>
                          {t("shadePercentageLabel")}:{" "}
                          {t(`shadePercentage_${plot.shadePercentage}` as "shadePercentage_pct_20")}
                        </p>
                      ) : null}
                      {plot.altitudeMinM != null || plot.altitudeMaxM != null ? (
                        <p>
                          {t("altitudeRangeLabel")}:{" "}
                          {t("altitudeRangeValue", {
                            min: plot.altitudeMinM ?? "?",
                            max: plot.altitudeMaxM ?? "?",
                          })}
                        </p>
                      ) : null}
                      {plot.slopeDescription ? (
                        <p>
                          {t("slopeLabel")}: {plot.slopeDescription}
                        </p>
                      ) : null}
                      {plot.aspect ? (
                        <p>
                          {t("aspectLabel")}: {t(`aspect_${plot.aspect}` as "aspect_north")}
                        </p>
                      ) : null}
                      {plot.soilType ? (
                        <p>
                          {t("soilTypeLabel")}: {plot.soilType}
                        </p>
                      ) : null}
                    </dl>
                  ) : (
                    // Tres palabras en vez de la frase entera: en la tarjeta
                    // basta con marcar el hueco, y la frase larga sigue estando
                    // en la ficha de la parcela, que es donde se rellena.
                    <p className="nn-muted">{t("plotNothingRecorded")}</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
