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
                plot.soilType != null;

              return (
                <div key={plot.id} className="nn-card-link" style={{ cursor: "default" }}>
                  <h3>{plot.name}</h3>
                  {plot.organization ? <p className="nn-detail-meta">{plot.organization.name}</p> : null}

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
                      {plot.soilType ? (
                        <p>
                          {t("soilTypeLabel")}: {plot.soilType}
                        </p>
                      ) : null}
                    </dl>
                  ) : (
                    <p className="nn-muted">{t("noConditionsRecorded")}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
