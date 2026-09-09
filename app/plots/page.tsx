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

      <section className="nn-section">
        {plotLocations.length === 0 ? (
          <p className="nn-muted">{t("noPlots")}</p>
        ) : (
          <div className="nn-grid">
            {plotLocations.map((plot) => {
              const hasConditions =
                plot.sunExposure != null ||
                plot.shadePercentage != null ||
                plot.altitudeMinM != null ||
                plot.altitudeMaxM != null ||
                plot.slopeDescription != null ||
                plot.aspect != null ||
                plot.soilType != null;

              return (
                <Link key={plot.id} href={`/plots/${plot.id}`} className="nn-card-link">
                  <h3>{plot.name}</h3>
                  {plot.organization ? <p className="nn-detail-meta">{plot.organization.name}</p> : null}

                  <p className="nn-detail-meta">
                    {t("areaLabel")}:{" "}
                    {plot.areaHectares != null ? (
                      t("areaValue", { hectares: Number(plot.areaHectares) })
                    ) : (
                      <span className="nn-muted">{t("notRecorded")}</span>
                    )}
                  </p>

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
                    <p className="nn-muted">{t("noConditionsRecorded")}</p>
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
