import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { mostrarInstante } from "../../../../lib/time/mostrarInstante";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getLotReport } from "../../../../lib/traceability/reports";
import { getSignedUrlForAsset } from "../../../../lib/traceability/media";
import { computeCurrentQuantity } from "../../../../lib/traceability/quantity";
import { TraceabilityAccessError } from "../../../../lib/traceability/lots";
import { PrintButton } from "../../../components/traceability/PrintButton";

export const dynamic = "force-dynamic";

/**
 * T13 (§30 screen 11). Print-friendly, authenticated Lot Summary Report —
 * ADR-039's "(b) a clean, printable authenticated web page (browser
 * print-to-PDF suffices)" reading of "sent to a client." No PDF
 * generation, no login-free external link (both explicitly deferred,
 * ADR-039). Deliberately read-only: no forms, no upload widgets, no
 * "record X" actions — app/globals.css's `@media print` rules hide any
 * app chrome that slips in regardless.
 *
 * Scope note: the ticket's own DoD text lists origin/lineage/processing/
 * measurements/samples/sensory. This report also renders a Photos
 * section, a deliberate small addition beyond that literal list — T12.5
 * (media attachment) landed after the DoD was written specifically so
 * this report could show real field photos, per the media-readiness
 * investigation's own prediction. Same "documented scope expansion"
 * pattern as T10's own note.
 */
export default async function LotReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");

  let report;
  try {
    report = await getLotReport(user.userAccountId, id);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) notFound();
    throw error;
  }

  const quantity = await computeCurrentQuantity(user.userAccountId, id);
  const assetsWithUrls = await Promise.all(
    report.assets.map(async (asset) => ({ asset, viewUrl: await getSignedUrlForAsset(asset.storageKey) })),
  );

  const { lot, origins, ancestorLots, descendantLots, measurements, samples, sensoryLinkage, fermentationRuns, dryingRuns, storageAssignments } = report;

  /**
   * En la zona del SITIO del lote, no en UTC. Un informe que dice que la
   * cosecha fue a las 12:30 cuando fue a las 07:30 es el mismo dato mal
   * contado, y un informe se imprime y se comparte. Ver
   * `lib/time/mostrarInstante.ts`.
   */
  const supersededMeasurementIds = new Set(measurements.map((m) => m.correctsId).filter((id): id is string => id != null));

  const formatDate = (date: Date) => mostrarInstante(date, lot.location?.timezone ?? null);

  return (
    <div>
      <Link href={`/lots/${lot.id}`} className="nn-back-link">
        {t("backToLot", { lotCode: lot.lotCode })}
      </Link>

      <div className="nn-report-actions">
        <PrintButton />
      </div>

      <span className="nn-badge">{t(`lotType_${lot.lotType}` as "lotType_cherry")}</span>
      <h1>{t("reportTitle", { lotCode: lot.lotCode })}</h1>
      <p className="nn-report-generated">{t("reportGeneratedAtLabel", { date: formatDate(report.generatedAt) })}</p>
      <p className="nn-detail-meta">
        <span>{t("currentQuantityLabel", { quantity: quantity.quantity.toString(), unit: quantity.unit ?? t("unitUnknown") })}</span>
        {lot.project ? <span>{lot.project.name}</span> : null}
        {lot.location ? <span>{lot.location.name}</span> : null}
        {lot.organization ? <span>{lot.organization.name}</span> : null}
      </p>

      <section className="nn-section">
        <h2>{t("originHeading")}</h2>
        {origins.harvestEvents.length === 0 && origins.receivingEvents.length === 0 && origins.apiaryHarvestEvents.length === 0 ? (
          <p className="nn-muted">{t("originUnknown")}</p>
        ) : (
          <ul>
            {origins.harvestEvents.map((h) => (
              <li key={h.id}>
                {t("originHarvestEntry", { date: formatDate(h.harvestedAt), organization: h.organization.name, location: h.location.name })}
              </li>
            ))}
            {origins.receivingEvents.map((r) => (
              <li key={r.id}>
                {t("originReceivingEntry", { date: formatDate(r.receivedAt), organization: r.organization.name })}
              </li>
            ))}
            {origins.apiaryHarvestEvents.map((a) => (
              <li key={a.id}>
                {t("originApiaryHarvestEntry", {
                  date: formatDate(a.occurredAt),
                  location: a.colony.hive.location.name,
                  organization: a.colony.hive.location.organization?.name ?? t("organizationUnknown"),
                })}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("originLotHeading")}</h2>
        {lot.location ? (
          <>
            <p className="nn-muted">{t("originLotConditionsIntro")}</p>
            <p className="nn-detail-meta">
              <span>{lot.location.name}</span>
              {lot.location.sunExposure ? (
                <span>
                  {t("sunExposureLabel")}: {t(`sunExposure_${lot.location.sunExposure}` as "sunExposure_full_sun")}
                </span>
              ) : null}
              {lot.location.shadePercentage ? (
                <span>
                  {t("shadePercentageLabel")}:{" "}
                  {t(`shadePercentage_${lot.location.shadePercentage}` as "shadePercentage_pct_20")}
                </span>
              ) : null}
              {lot.location.altitudeMinM != null || lot.location.altitudeMaxM != null ? (
                <span>
                  {t("altitudeRangeLabel")}:{" "}
                  {t("altitudeRangeValue", {
                    min: lot.location.altitudeMinM ?? "?",
                    max: lot.location.altitudeMaxM ?? "?",
                  })}
                </span>
              ) : null}
              {lot.location.slopeDescription ? (
                <span>
                  {t("slopeLabel")}: {lot.location.slopeDescription}
                </span>
              ) : null}
              {lot.location.soilType ? (
                <span>
                  {t("soilTypeLabel")}: {lot.location.soilType}
                </span>
              ) : null}
            </p>
          </>
        ) : (
          <p className="nn-muted">{t("noOriginLot")}</p>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("lineageHeading")}</h2>
        {ancestorLots.length === 0 && descendantLots.length === 0 ? (
          <p className="nn-muted">{t("lineageNone")}</p>
        ) : (
          <>
            {ancestorLots.length > 0 ? (
              <p>
                {t("ancestorsHeading")}: {ancestorLots.map((l) => l.lotCode).join(", ")}
              </p>
            ) : null}
            {descendantLots.length > 0 ? (
              <p>
                {t("descendantsHeading")}: {descendantLots.map((l) => l.lotCode).join(", ")}
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("processingHeading")}</h2>
        {fermentationRuns.length === 0 && dryingRuns.length === 0 && storageAssignments.length === 0 ? (
          <p className="nn-muted">{t("noProcessing")}</p>
        ) : (
          <ul>
            {fermentationRuns.map((run) => (
              <li key={run.id}>
                {t("processingFermentationEntry", {
                  start: formatDate(run.startedAt),
                  end: run.endedAt ? formatDate(run.endedAt) : t("processingOngoing"),
                })}
              </li>
            ))}
            {dryingRuns.map((run) => (
              <li key={run.id}>
                {t("processingDryingEntry", {
                  start: formatDate(run.startedAt),
                  end: run.endedAt ? formatDate(run.endedAt) : t("processingOngoing"),
                })}
              </li>
            ))}
            {storageAssignments.map((assignment) => (
              <li key={assignment.id}>
                {t("processingStorageEntry", { location: assignment.location.name, start: formatDate(assignment.startedAt) })}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("measurementsHeading")}</h2>
        {measurements.length === 0 ? (
          <p className="nn-muted">{t("noMeasurements")}</p>
        ) : (
          <ul>
            {measurements.map((m) => (
              <li key={m.id}>
                {m.variable}: {m.value.toString()} {m.unit} — {formatDate(m.occurredAt)}
                {m.correctsId ? ` (${t("correctionLabel")})` : ""}
                {supersededMeasurementIds.has(m.id) ? <> · <strong>{t("supersededLabel")}</strong></> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("samplesHeading")}</h2>
        {samples.length === 0 ? (
          <p className="nn-muted">{t("noSamples")}</p>
        ) : (
          <ul>
            {samples.map((s) => (
              <li key={s.id}>
                {s.sampleCode} ({s.sampleType})
              </li>
            ))}
          </ul>
        )}
      </section>

      {samples.some((s) => sensoryLinkage[s.id]?.length) ? (
        <section className="nn-section">
          <h2>{t("sensoryHeading")}</h2>
          <ul>
            {samples.flatMap((s) =>
              (sensoryLinkage[s.id] ?? []).map((entry) => (
                <li key={`${s.id}-${entry.sessionId}`}>
                  {s.sampleCode} — {entry.sessionName}
                  {entry.overallResult ? (
                    <>: {t("sensoryOverallScoreLabel", { mean: entry.overallResult.meanValue, count: entry.overallResult.responseCount })}</>
                  ) : (
                    <> — {t("sensoryAwaitingResultLabel")}</>
                  )}
                  {(report.roastPreparations ?? []).filter((preparation) =>
                    preparation.sampleId === s.id && preparation.sessionId === entry.sessionId,
                  ).map((preparation) => (
                    <p className="nn-muted" key={preparation.roastId}>
                      {t("reportRoastReferenceLabel")}: {preparation.roastId}<br />
                      {t("roastStartedAtLabel")}: {formatDate(preparation.startedAt)}
                      {preparation.endedAt ? <> · {t("roastEndedAtLabel")}: {formatDate(preparation.endedAt)}</> : null}
                      {preparation.roastLevel ? <> · {t("roastLevelLabel")}: {preparation.roastLevel}</> : null}
                      {preparation.chargeWeightKg != null ? <> · {t("roastChargeWeightLabel")}: {preparation.chargeWeightKg}</> : null}
                      {preparation.dischargeWeightKg != null ? <> · {t("roastDischargeWeightLabel")}: {preparation.dischargeWeightKg}</> : null}
                    </p>
                  ))}
                </li>
              )),
            )}
          </ul>
        </section>
      ) : null}

      {assetsWithUrls.length > 0 ? (
        <section className="nn-section">
          <h2>{t("photosHeading")}</h2>
          <ul className="nn-report-photos">
            {assetsWithUrls.map(({ asset, viewUrl }) => (
              <li key={asset.id}>
                {asset.assetType === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed R2 URL, not a static/optimizable Next asset
                  <img src={viewUrl} alt="" />
                ) : (
                  <a href={viewUrl}>{asset.originalFilename ?? asset.id}</a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
