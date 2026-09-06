import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getSessionForJudge, getSessionForHeadJudge, SensoryAccessError } from "../../../lib/sensory/service";
import { computePanelResultFormAction } from "../../actions/sensory";
import { AssessmentForm } from "../../components/AssessmentForm";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";

export const dynamic = "force-dynamic";

export default async function SensorySessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Sensory");

  let judgeView;
  try {
    judgeView = await getSessionForJudge(user.userAccountId, sessionId);
  } catch (error) {
    if (error instanceof SensoryAccessError) {
      notFound();
    }
    throw error;
  }

  const { session, canSubmitAssessment, canManageSession, canViewBlindMapping } = judgeView;

  const headJudgeView = canViewBlindMapping ? await getSessionForHeadJudge(user.userAccountId, sessionId) : null;

  const attributeOptions = session.protocolVersion.attributes.map((a) => ({
    id: a.id,
    name: a.name,
    scaleMin: a.scaleMin.toNumber(),
    scaleMax: a.scaleMax.toNumber(),
  }));
  const scoreMin = session.protocolVersion.scoreMin.toNumber();
  const scoreMax = session.protocolVersion.scoreMax.toNumber();

  const headJudgeSamplesByFlight = new Map(
    headJudgeView?.flights.map((f) => [f.id, f.blindSamples]) ?? [],
  );

  return (
    <div>
      <Link href="/sensory" className="nn-back-link">
        {t("backToSessions")}
      </Link>

      <h1>{session.name}</h1>
      <p className="nn-muted">
        {session.protocolVersion.protocol.name} v{session.protocolVersion.version}
      </p>

      {session.flights.map((flight) => (
        <section key={flight.id} style={{ marginTop: "2rem" }}>
          <h2>{flight.name}</h2>

          {flight.blindSamples.map((blindSample) => {
            const alreadySubmitted = blindSample.assessments.length > 0;
            const headJudgeSample = headJudgeSamplesByFlight.get(flight.id)?.find((s) => s.id === blindSample.id);

            return (
              <div key={blindSample.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0 }}>{t("blindCodeLabel", { code: blindSample.blindCode })}</h3>

                {headJudgeSample ? (
                  <div className="nn-detail-meta">
                    <span>
                      {t("realSampleLabel", {
                        code: headJudgeSample.blindMapping?.sample.sampleCode ?? t("noMapping"),
                      })}
                    </span>
                  </div>
                ) : null}

                {canSubmitAssessment ? (
                  alreadySubmitted ? (
                    <p className="nn-muted">{t("alreadySubmitted")}</p>
                  ) : (
                    <AssessmentForm
                      sessionId={sessionId}
                      blindSampleId={blindSample.id}
                      scoreMin={scoreMin}
                      scoreMax={scoreMax}
                      attributes={attributeOptions}
                    />
                  )
                ) : null}

                {canManageSession && headJudgeSample ? (
                  <div style={{ marginTop: "1rem" }}>
                    <p className="nn-muted">
                      {t("assessmentCount", { count: headJudgeSample.assessments.length })}
                    </p>
                    <form action={computePanelResultFormAction}>
                      <input type="hidden" name="sessionId" value={sessionId} />
                      <input type="hidden" name="blindSampleId" value={blindSample.id} />
                      <BotonDeEnvio className="nn-button" disabled={headJudgeSample.assessments.length === 0}>
                        {t("computePanelResultButton")}
                      </BotonDeEnvio>
                    </form>

                    {headJudgeSample.panelResults.length > 0 ? (
                      <ul>
                        {headJudgeSample.panelResults.map((result) => (
                          <li key={result.id}>
                            {result.attribute ? result.attribute.name : t("overallScoreResultLabel")}:{" "}
                            {t("panelResultSummary", {
                              mean: result.meanValue.toNumber().toFixed(2),
                              min: result.minValue.toNumber().toFixed(2),
                              max: result.maxValue.toNumber().toFixed(2),
                              count: result.responseCount,
                            })}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
