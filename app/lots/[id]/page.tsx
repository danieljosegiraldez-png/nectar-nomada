import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getLotDetail, getObserverCandidates, TraceabilityAccessError } from "../../../lib/traceability/lots";
import { computeCurrentQuantity } from "../../../lib/traceability/quantity";
import {
  recordFermentationInterventionFormAction,
  endFermentationFormAction,
  recordDryingTurnFormAction,
  endDryingFormAction,
} from "../../actions/traceability";
import { MeasurementForm } from "../../components/traceability/MeasurementForm";

export const dynamic = "force-dynamic";

const FERMENTATION_INTERVENTION_TYPES = ["inoculation", "agitation", "purge", "addition", "sample", "transfer", "termination", "other"] as const;
const DRYING_TURN_TYPES = ["turned", "covered", "uncovered", "other"] as const;
const LOT_TYPES = ["cherry", "processing", "drying", "green", "roast", "sample", "other"] as const;

export default async function LotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");

  let detail;
  try {
    detail = await getLotDetail(user.userAccountId, id);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) notFound();
    throw error;
  }

  const quantity = await computeCurrentQuantity(user.userAccountId, id);
  const { people: observers, selfPersonId } = await getObserverCandidates(user.userAccountId);

  const { lot, lineage, transformations, quantityEvents, measurements, samples, fermentationRuns, dryingRuns, storageAssignments, tasks, auditEvents, sensoryLinkage } = detail;

  const activeFermentation = fermentationRuns.find((r) => r.endedAt === null) ?? null;
  const activeDrying = dryingRuns.find((r) => r.endedAt === null) ?? null;
  const currentStorage = storageAssignments.find((s) => s.endedAt === null) ?? null;

  const currentStage = activeFermentation
    ? t("stageFermenting")
    : activeDrying
      ? t("stageDrying")
      : currentStorage
        ? t("stageInStorage")
        : t(`lotType_${lot.lotType}` as "lotType_cherry");

  type TimelineEntry = { occurredAt: Date; label: string; key: string };
  const timeline: TimelineEntry[] = [
    ...transformations.map((tr) => ({ occurredAt: tr.occurredAt, label: t(`transformationType_${tr.transformationType}` as "transformationType_split"), key: `tr-${tr.id}` })),
    ...quantityEvents.map((qe) => ({ occurredAt: qe.occurredAt, label: `${t(`quantityEventType_${qe.eventType}` as "quantityEventType_received")}: ${qe.quantity.toString()} ${qe.unit}`, key: `qe-${qe.id}` })),
    ...measurements.map((m) => ({ occurredAt: m.occurredAt, label: `${m.variable}: ${m.value.toString()} ${m.unit}`, key: `me-${m.id}` })),
  ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  return (
    <div>
      <Link href="/lots" className="nn-back-link">
        {t("backToLots")}
      </Link>

      <span className="nn-badge">{t(`lotType_${lot.lotType}` as "lotType_cherry")}</span>
      <h1>{lot.lotCode}</h1>
      <p className="nn-detail-meta">
        <span>{t("currentStageLabel", { stage: currentStage })}</span>
        <span>{t("currentQuantityLabel", { quantity: quantity.quantity.toString(), unit: quantity.unit ?? t("unitUnknown") })}</span>
        {lot.project ? <span>{lot.project.name}</span> : null}
        {lot.location ? <span>{lot.location.name}</span> : null}
        {lot.organization ? <span>{lot.organization.name}</span> : null}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
        {!activeFermentation && !activeDrying ? (
          <>
            <Link href={`/lots/${lot.id}/fermentation/new`} className="nn-button" style={{ textDecoration: "none" }}>
              {t("startFermentationButton")}
            </Link>
            <Link href={`/lots/${lot.id}/drying/new`} className="nn-button" style={{ textDecoration: "none" }}>
              {t("startDryingButton")}
            </Link>
          </>
        ) : null}
        <Link href={`/lots/${lot.id}/storage/new`} className="nn-button" style={{ textDecoration: "none" }}>
          {t("moveStorageButton")}
        </Link>
        <Link href={`/lots/${lot.id}/samples/new`} className="nn-button" style={{ textDecoration: "none" }}>
          {t("createSampleButton")}
        </Link>
      </div>

      <section className="nn-section">
        <h2>{t("lineageHeading")}</h2>
        <p className="nn-detail-meta">
          <span>{t("ancestorsLabel", { count: lineage.ancestorLotIds.length })}</span>
          <span>{t("descendantsLabel", { count: lineage.descendantLotIds.length })}</span>
        </p>
        {lineage.ancestorLotIds.length > 0 ? (
          <p>
            {t("ancestorsHeading")}:{" "}
            {lineage.ancestorLotIds.map((ancestorId, i) => (
              <span key={ancestorId}>
                {i > 0 ? ", " : ""}
                <Link href={`/lots/${ancestorId}`}>{ancestorId.slice(0, 8)}</Link>
              </span>
            ))}
          </p>
        ) : null}
        {lineage.descendantLotIds.length > 0 ? (
          <p>
            {t("descendantsHeading")}:{" "}
            {lineage.descendantLotIds.map((descendantId, i) => (
              <span key={descendantId}>
                {i > 0 ? ", " : ""}
                <Link href={`/lots/${descendantId}`}>{descendantId.slice(0, 8)}</Link>
              </span>
            ))}
          </p>
        ) : null}
      </section>

      <section className="nn-section">
        <h2>{t("processingHeading")}</h2>
        {activeFermentation ? (
          <div className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>{t("activeFermentationHeading")}</h3>
            <p className="nn-muted">{t("startedAtLabel", { date: activeFermentation.startedAt.toISOString().slice(0, 16).replace("T", " ") })}</p>
            {activeFermentation.interventions.length > 0 ? (
              <ul>
                {activeFermentation.interventions.map((iv) => (
                  <li key={iv.id}>
                    {t(`interventionType_${iv.interventionType}` as "interventionType_agitation")} — {iv.occurredAt.toISOString().slice(0, 16).replace("T", " ")}
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={recordFermentationInterventionFormAction} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="lotId" value={lot.id} />
              <input type="hidden" name="fermentationRunId" value={activeFermentation.id} />
              <select name="interventionType" defaultValue="agitation">
                {FERMENTATION_INTERVENTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`interventionType_${type}` as "interventionType_agitation")}
                  </option>
                ))}
              </select>
              <button type="submit" className="nn-button">
                {t("recordInterventionButton")}
              </button>
            </form>
            <form action={endFermentationFormAction} className="nn-form" style={{ maxWidth: 420, marginTop: "1rem" }}>
              <input type="hidden" name="lotId" value={lot.id} />
              <input type="hidden" name="fermentationRunId" value={activeFermentation.id} />
              <div className="nn-field">
                <label htmlFor="ferm-output-code">{t("outputLotCodeLabel")}</label>
                <input id="ferm-output-code" name="outputLotCode" type="text" required />
              </div>
              <div className="nn-field">
                <label htmlFor="ferm-output-type">{t("outputLotTypeLabel")}</label>
                <select id="ferm-output-type" name="outputLotType" defaultValue="drying">
                  {LOT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`lotType_${type}` as "lotType_cherry")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="nn-field">
                <label htmlFor="ferm-output-quantity">{t("quantityLabel")}</label>
                <input id="ferm-output-quantity" name="quantity" type="number" step="0.001" />
              </div>
              <div className="nn-field">
                <label htmlFor="ferm-output-unit">{t("unitLabel")}</label>
                <input id="ferm-output-unit" name="unit" type="text" placeholder="kg" />
              </div>
              <button type="submit" className="nn-button">
                {t("endFermentationButton")}
              </button>
            </form>
          </div>
        ) : null}

        {activeDrying ? (
          <div className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>{t("activeDryingHeading")}</h3>
            <p className="nn-muted">{t("startedAtLabel", { date: activeDrying.startedAt.toISOString().slice(0, 16).replace("T", " ") })}</p>
            {activeDrying.turningEvents.length > 0 ? (
              <ul>
                {activeDrying.turningEvents.map((ev) => (
                  <li key={ev.id}>
                    {t(`turnEventType_${ev.eventType}` as "turnEventType_turned")} — {ev.occurredAt.toISOString().slice(0, 16).replace("T", " ")}
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={recordDryingTurnFormAction} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="lotId" value={lot.id} />
              <input type="hidden" name="dryingRunId" value={activeDrying.id} />
              <select name="eventType" defaultValue="turned">
                {DRYING_TURN_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`turnEventType_${type}` as "turnEventType_turned")}
                  </option>
                ))}
              </select>
              <button type="submit" className="nn-button">
                {t("recordTurnButton")}
              </button>
            </form>
            <form action={endDryingFormAction} className="nn-form" style={{ maxWidth: 420, marginTop: "1rem" }}>
              <input type="hidden" name="lotId" value={lot.id} />
              <input type="hidden" name="dryingRunId" value={activeDrying.id} />
              <div className="nn-field">
                <label htmlFor="dry-output-code">{t("outputLotCodeLabel")}</label>
                <input id="dry-output-code" name="outputLotCode" type="text" required />
              </div>
              <div className="nn-field">
                <label htmlFor="dry-output-type">{t("outputLotTypeLabel")}</label>
                <select id="dry-output-type" name="outputLotType" defaultValue="green">
                  {LOT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`lotType_${type}` as "lotType_cherry")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="nn-field">
                <label htmlFor="dry-output-quantity">{t("quantityLabel")}</label>
                <input id="dry-output-quantity" name="quantity" type="number" step="0.001" />
              </div>
              <div className="nn-field">
                <label htmlFor="dry-output-unit">{t("unitLabel")}</label>
                <input id="dry-output-unit" name="unit" type="text" placeholder="kg" />
              </div>
              <button type="submit" className="nn-button">
                {t("endDryingButton")}
              </button>
            </form>
          </div>
        ) : null}

        {currentStorage ? (
          <p className="nn-muted">{t("currentStorageLabel", { location: currentStorage.location.name })}</p>
        ) : null}

        {!activeFermentation && !activeDrying && !currentStorage ? <p className="nn-muted">{t("noProcessing")}</p> : null}
      </section>

      <section className="nn-section">
        <h2>{t("measurementsHeading")}</h2>
        {measurements.length === 0 ? (
          <p className="nn-muted">{t("noMeasurements")}</p>
        ) : (
          <ul>
            {measurements.map((m) => (
              <li key={m.id}>
                {m.variable}: {m.value.toString()} {m.unit} — {m.occurredAt.toISOString().slice(0, 16).replace("T", " ")}
                {m.correctsId ? ` (${t("correctionLabel")})` : ""}
              </li>
            ))}
          </ul>
        )}
        <MeasurementForm lotId={lot.id} observers={observers} selfPersonId={selfPersonId} />
      </section>

      <section className="nn-section">
        <h2>{t("timelineHeading")}</h2>
        {timeline.length === 0 ? (
          <p className="nn-muted">{t("noTimeline")}</p>
        ) : (
          <ul>
            {timeline.map((entry) => (
              <li key={entry.key}>
                {entry.occurredAt.toISOString().slice(0, 16).replace("T", " ")} — {entry.label}
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
                    <>
                      : {t("sensoryOverallScoreLabel", { mean: entry.overallResult.meanValue, count: entry.overallResult.responseCount })}
                    </>
                  ) : (
                    <> — {t("sensoryAwaitingResultLabel")}</>
                  )}
                </li>
              )),
            )}
          </ul>
        </section>
      ) : null}

      {lot.projectId ? (
        <section className="nn-section">
          <h2>{t("tasksHeading")}</h2>
          {tasks.length === 0 ? (
            <p className="nn-muted">{t("noTasks")}</p>
          ) : (
            <ul>
              {tasks.map((task) => (
                <li key={task.id}>{task.title}</li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="nn-section">
        <h2>{t("historyHeading")}</h2>
        {auditEvents.length === 0 ? (
          <p className="nn-muted">{t("noHistory")}</p>
        ) : (
          <ul>
            {auditEvents.map((ev) => (
              <li key={ev.id}>
                {ev.operation} — {ev.occurredAt.toISOString().slice(0, 16).replace("T", " ")}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
