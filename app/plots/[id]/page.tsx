import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getPlotDetail } from "../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../lib/traceability/locations";
import { PlotAttributesForm } from "../../components/traceability/PlotAttributesForm";

export const dynamic = "force-dynamic";

/**
 * What stands in one block.
 *
 * The page's job is as much to show what is *missing* as what is recorded.
 * Every block at Finca Rosina has cohorts and no area, so density cannot be
 * computed — and that gap only existed in conversation until now. Here it is
 * on screen every time someone opens the page, with the specific reason it
 * cannot be computed rather than a blank.
 */
export default async function PlotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");

  let detail;
  try {
    detail = await getPlotDetail(user.userAccountId, id);
  } catch (error) {
    // Not "forbidden": a block this user may not read is a block that, for
    // them, is not there. Distinguishing the two would confirm it exists.
    if (error instanceof LocationAccessError) notFound();
    throw error;
  }

  const { location, cohorts, density, organizationName } = detail;
  const activas = cohorts.filter((c) => c.status === "active");

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href="/plots">{t("backToPlots")}</Link>
      </p>

      <span className="nn-badge">{t("badge")}</span>
      <h1>{location.name}</h1>
      {organizationName ? <p className="nn-detail-meta">{organizationName}</p> : null}
      {location.description ? <p className="nn-muted">{location.description}</p> : null}

      <section className="nn-section">
        <h2>{t("standingPopulationHeading")}</h2>

        {/* `nn-table` carries no rule in globals.css; every table in this app
            styles itself inline, and this one follows that convention rather
            than introducing a stylesheet rule the others would not share. */}

        {activas.length === 0 ? (
          <p className="nn-muted">{t("noCohorts")}</p>
        ) : (
          <table className="nn-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem 0.4rem 0" }}>{t("cultivarLabel")}</th>
                <th style={{ textAlign: "right", padding: "0.4rem 0.75rem" }}>{t("plantCountLabel")}</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>{t("plantedLabel")}</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0 0.4rem 0.75rem" }}>{t("howKnownLabel")}</th>
              </tr>
            </thead>
            <tbody>
              {activas.map((cohort) => (
                <tr key={cohort.id}>
                  <td style={{ padding: "0.4rem 0.75rem 0.4rem 0" }}>
                    {cohort.cultivarValue?.value ?? t("cultivarUnknown")}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", padding: "0.4rem 0.75rem" }}>
                    {/* Never zero for a missing count: ADR-080 keeps "not
                        recorded" and "recorded as zero" apart, and a block
                        showing 0 trees would read as a cleared block. */}
                    {cohort.plantCount ?? <span className="nn-muted">{t("notRecorded")}</span>}
                  </td>
                  <td style={{ padding: "0.4rem 0.75rem" }}>
                    {cohort.plantedAt ? (
                      formatPlanted(cohort.plantedAt, cohort.plantedPrecision)
                    ) : (
                      <span className="nn-muted">{t("plantedUnknown")}</span>
                    )}
                  </td>
                  <td className="nn-detail-meta" style={{ padding: "0.4rem 0 0.4rem 0.75rem" }}>
                    {t(
                      `provenanceClass_${cohort.provenanceClass}` as "provenanceClass_direct_observation",
                    )}
                    {cohort.dataQuality ? (
                      <>
                        {" · "}
                        <strong>
                          {t(`dataQuality_${cohort.dataQuality}` as "dataQuality_provisional")}
                        </strong>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activas.some((c) => c.notes) ? (
          <div className="nn-detail-meta">
            {activas
              .filter((c) => c.notes)
              .map((c) => (
                <p key={`note-${c.id}`}>{c.notes}</p>
              ))}
          </div>
        ) : null}
      </section>

      <section className="nn-section">
        <h2>{t("densityHeading")}</h2>
        {density.status === "ok" ? (
          <>
            <p style={{ fontVariantNumeric: "tabular-nums", fontSize: "1.25rem" }}>
              {t("densityValue", { plants: density.plantsPerHectare })}
            </p>
            <p className="nn-detail-meta">
              {t("densityBasis", { plants: density.totalPlants, hectares: density.hectares })}
            </p>
          </>
        ) : (
          <p className="nn-muted">
            {density.status === "sin_area"
              ? t("densityMissingArea")
              : density.status === "area_no_positiva"
                ? t("densityBadArea")
                : density.status === "conteo_incompleto"
                  ? t("densityMissingCount", { cohorts: density.cohortesSinConteo })
                  : t("densityNoCohorts")}
          </p>
        )}
        {/* Said plainly so nobody looks for a stored column that is empty on
            purpose: this is computed on read, never written to
            `PlantingCohort.densityPerHectare`. */}
        <p className="nn-detail-meta">{t("densityComputedNote")}</p>
      </section>

      <section className="nn-section">
        <h2>{t("groundConditionsHeading")}</h2>

        {/* Editable en vez de solo lectura. La lista de antes decía «Sin
            registrar» y no ofrecía forma de arreglarlo: el dato tenía que
            pasar por una conversación y un script. El formulario dice lo
            mismo —una casilla vacía con «Sin registrar» de marcador— y
            además deja llenarlo. `areaHectares` es el que desbloquea la
            densidad, que la sección de arriba ya está lista para mostrar. */}
        <PlotAttributesForm
          locationId={location.id}
          attributes={{
            // Decimal se pasa como cadena, no como número: `Number()` sobre
            // Decimal(10,4) puede redondear, y este valor va de vuelta a una
            // casilla que el usuario reenvía tal cual.
            areaHectares: location.areaHectares?.toString() ?? null,
            plantSpacingMeters: location.plantSpacingMeters?.toString() ?? null,
            altitudeMinM: location.altitudeMinM,
            altitudeMaxM: location.altitudeMaxM,
            sunExposure: location.sunExposure,
            shadePercentage: location.shadePercentage,
            slopeDescription: location.slopeDescription,
            soilType: location.soilType,
          }}
        />

      </section>
    </div>
  );
}


/**
 * A date is shown only as precisely as it was recorded. "Sembrado en 2019" and
 * "sembrado el 14 de marzo de 2019" are different claims (the schema note on
 * `plantedPrecision` says so), and rendering both as a full date would
 * manufacture the second from the first.
 */
function formatPlanted(plantedAt: Date, precision: "year" | "month" | "date" | null): string {
  const iso = plantedAt.toISOString();
  if (precision === "year") return iso.slice(0, 4);
  if (precision === "month") return iso.slice(0, 7);
  if (precision === "date") return iso.slice(0, 10);
  // No precision recorded: show the coarsest reading rather than the most
  // precise, since the stored instant is not evidence of a known day.
  return iso.slice(0, 4);
}
