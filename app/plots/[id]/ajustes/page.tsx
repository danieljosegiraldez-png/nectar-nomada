import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getPlotDetail } from "../../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../../lib/traceability/locations";
import { listSoilProfilesForLocation } from "../../../../lib/traceability/soilProfiles";
import { estadosPorCohorte } from "../../../../lib/traceability/estadoDeProduccion";
import { recortarPorPrecision } from "../../../../lib/time/recortarPorPrecision";
import { PlantingCohortForm } from "../../../components/traceability/PlantingCohortForm";
import { PlotAttributesForm } from "../../../components/traceability/PlotAttributesForm";
import { SoilProfileForm } from "../../../components/traceability/SoilProfileForm";
import { MarcarEnProduccionForm } from "../../../components/traceability/MarcarEnProduccionForm";

export const dynamic = "force-dynamic";

/**
 * Gestionar una parcela — tablero de parcela, spec §6.
 *
 * Sólo formularios de gestión. Lo que se hace en campo —iniciar una jornada,
 * registrar una muestra, describir una calicata— se queda en el tablero.
 * Misma compuerta que el tablero (`getPlotDetail`), y cuelga de `/plots`, así
 * que hereda `FieldSyncControls` del layout y la carga sin red del service
 * worker.
 */
export default async function PlotSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let detail;
  try {
    detail = await getPlotDetail(user.userAccountId, id);
  } catch (error) {
    if (error instanceof LocationAccessError) notFound();
    throw error;
  }

  const { location, cohorts, cultivarOptions, eventosDeProduccion } = detail;
  const activas = cohorts.filter((c) => c.status === "active");
  const estados = estadosPorCohorte(activas.map((c) => c.id), eventosDeProduccion);
  const calicatas = await listSoilProfilesForLocation(user.userAccountId, id);

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href={`/plots/${location.id}`}>{t("plotDashboardBackLink")}</Link>
      </p>
      <h1>{t("plotDashboardSettingsTitle", { name: location.name })}</h1>

      <section className="nn-section" id="siembras">
        <h2>{t("plotDashboardCohortsHeading")}</h2>
        {activas.length === 0 ? <p className="nn-muted">{t("noCohorts")}</p> : null}
        {activas.map((cohort) => {
          const estado = estados.get(cohort.id);
          return (
            <article key={cohort.id} className="nn-card">
              <h3>
                {cohort.cultivarValue?.value ?? t("cultivarUnknown")}
                {" · "}
                {cohort.plantCount ?? <span className="nn-muted">{t("notRecorded")}</span>}
                {" · "}
                {cohort.plantedAt ? (
                  recortarPorPrecision(cohort.plantedAt.toISOString(), cohort.plantedPrecision ?? "year")
                ) : (
                  <span className="nn-muted">{t("plantedUnknown")}</span>
                )}
              </h3>
              <p className="nn-detail-meta">
                {estado?.estado === "en_produccion" ? (
                  t("plotDashboardProductionSince", {
                    fecha: recortarPorPrecision(estado.desde.toISOString(), estado.precision ?? "date"),
                  })
                ) : (
                  <strong>{t("plotDashboardProductionUnmarked")}</strong>
                )}
              </p>
              <p className="nn-detail-meta">
                {t(`provenanceClass_${cohort.provenanceClass}` as "provenanceClass_direct_observation")}
                {cohort.dataQuality ? (
                  <>
                    {" · "}
                    <strong>{t(`dataQuality_${cohort.dataQuality}` as "dataQuality_provisional")}</strong>
                  </>
                ) : null}
              </p>
              {cohort.notes ? <p className="nn-detail-meta">{cohort.notes}</p> : null}
              <details>
                <summary>{t("plotDashboardMarkProductionSummary")}</summary>
                <MarcarEnProduccionForm cohortId={cohort.id} locationId={location.id} />
              </details>
              <details>
                <summary>
                  {t("cohortEditSummary", { cultivar: cohort.cultivarValue?.value ?? t("cultivarUnknown") })}
                </summary>
                <PlantingCohortForm
                  locationId={location.id}
                  cultivars={cultivarOptions}
                  cohort={{
                    id: cohort.id,
                    cultivarValueId: cohort.cultivarValueId,
                    plantCount: cohort.plantCount,
                    plantedAt: cohort.plantedAt ? cohort.plantedAt.toISOString() : null,
                    plantedPrecision: cohort.plantedPrecision,
                    dataQuality: cohort.dataQuality,
                    notes: cohort.notes,
                  }}
                />
              </details>
            </article>
          );
        })}
        <details>
          <summary>{t("cohortCreateSummary")}</summary>
          <PlantingCohortForm locationId={location.id} cultivars={cultivarOptions} />
        </details>
      </section>

      <section className="nn-section" id="condiciones">
        <h2>{t("groundConditionsHeading")}</h2>
        <PlotAttributesForm
          locationId={location.id}
          attributes={{
            // Decimal como cadena: `Number()` sobre Decimal(10,4) puede redondear.
            areaHectares: location.areaHectares?.toString() ?? null,
            plantSpacingMeters: location.plantSpacingMeters?.toString() ?? null,
            altitudeMinM: location.altitudeMinM,
            altitudeMaxM: location.altitudeMaxM,
            sunExposure: location.sunExposure,
            shadePercentage: location.shadePercentage,
            slopeDescription: location.slopeDescription,
            aspect: location.aspect,
            soilType: location.soilType,
          }}
        />
      </section>

      <section className="nn-section" id="calicatas">
        <h2>{t("soilProfileHeading")}</h2>
        {calicatas.length === 0 ? <p className="nn-muted">{t("soilNoProfiles")}</p> : null}
        {calicatas.map((c) => (
          <details key={c.id}>
            <summary>
              {t("soilCorrectHeading")} · {c.describedAt.toISOString().slice(0, 10)}
            </summary>
            <SoilProfileForm
              locationId={location.id}
              values={{
                id: c.id,
                describedAt: c.describedAt.toISOString().slice(0, 10),
                pitDepthCm: c.pitDepthCm,
                rootingDepthCm: c.rootingDepthCm,
                rootDistribution: c.rootDistribution,
                mottling: c.mottling,
                greyColours: c.greyColours,
                rootChannelConcretions: c.rootChannelConcretions,
                sourSmell: c.sourSmell,
                impedingLayerDepthCm: c.impedingLayerDepthCm,
                impedingLayerNote: c.impedingLayerNote,
                provenanceClass: c.provenanceClass,
                dataQuality: c.dataQuality,
                notes: c.notes,
              }}
            />
          </details>
        ))}
      </section>
    </div>
  );
}
