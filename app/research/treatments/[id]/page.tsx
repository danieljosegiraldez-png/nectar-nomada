import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getTreatmentBatchDetail } from "../../../../lib/research/treatments";
import { ResearchAccessError } from "../../../../lib/research/access";
import { AddProcessingStageForm, CompleteProcessingStageForm } from "../../../components/research/ProcessingStageForm";

export const dynamic = "force-dynamic";

export default async function TreatmentBatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const t = await getTranslations("Research");

  let batch;
  try {
    batch = await getTreatmentBatchDetail(user.userAccountId, id);
  } catch (error) {
    if (error instanceof ResearchAccessError) notFound();
    throw error;
  }

  const nextSequenceOrder = batch.processingStages.length;

  return (
    <div>
      <Link href={`/research/${batch.protocolVersion.protocolId}`} className="nn-back-link">
        {t("backToResearch")}
      </Link>
      <h1>
        {t("treatmentDetailHeading")}: {batch.batchLabel}
      </h1>
      <p className="nn-muted">
        {batch.protocolVersion.protocol.name} — {t("versionLabel")} {batch.protocolVersion.version}
        {batch.lot ? ` — ${batch.lot.lotCode}` : ""}
      </p>

      <section className="nn-section">
        <h2>{t("variablesHeading")}</h2>
        <ul>
          {batch.variableValues.map((vv) => (
            <li key={vv.id}>
              {vv.protocolVariable.name}:{" "}
              {vv.catalogValue?.value ??
                vv.textValue ??
                vv.numericValue?.toString() ??
                (vv.booleanValue != null ? String(vv.booleanValue) : "—")}
              {vv.dataQuality ? ` (${vv.dataQuality})` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="nn-section">
        <h2>{t("stagesHeading")}</h2>
        {batch.processingStages.map((stage) => (
          <div key={stage.id} className="nn-card-link" style={{ cursor: "default", marginBottom: "0.75rem" }}>
            <h3>
              {stage.sequenceOrder}. {stage.name} {stage.completedAt ? "✓" : ""}
            </h3>
            {stage.location ? (
              <p className="nn-detail-meta">
                {stage.location.name}
                {stage.location.dryingRoomLightExposure ? ` — ${stage.location.dryingRoomLightExposure}` : ""}
                {stage.location.dryingRoomBedLevelCount != null ? ` — ${stage.location.dryingRoomBedLevelCount} niveles` : ""}
              </p>
            ) : null}
            <ul>
              {stage.measurements.map((m) => (
                <li key={m.id}>
                  {m.variable}: {m.value.toString()} {m.unit}
                </li>
              ))}
              {stage.observations.map((o) => (
                <li key={o.id}>{o.catalogValue.value}</li>
              ))}
            </ul>
            {!stage.completedAt ? (
              <CompleteProcessingStageForm treatmentBatchId={batch.id} processingStageId={stage.id} />
            ) : null}
          </div>
        ))}
        <AddProcessingStageForm treatmentBatchId={batch.id} nextSequenceOrder={nextSequenceOrder} />
      </section>

      <section className="nn-section">
        <h2>{t("measurementsHeading")}</h2>
        {batch.measurements.length === 0 ? (
          <p className="nn-muted">—</p>
        ) : (
          <ul>
            {batch.measurements.map((m) => (
              <li key={m.id}>
                {m.variable}: {m.value.toString()} {m.unit}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("sensoryLinkageHeading")}</h2>
        {Object.keys(batch.sensoryLinkage).length === 0 ? (
          <p className="nn-muted">{t("noSensoryLinkage")}</p>
        ) : (
          Object.entries(batch.sensoryLinkage).map(([sampleId, entries]) => (
            <div key={sampleId}>
              {entries.map((entry, i) => (
                <p key={i}>
                  {entry.sessionName} ({entry.sessionStatus})
                  {entry.overallResult ? ` — mean ${entry.overallResult.meanValue}` : ""}
                </p>
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
