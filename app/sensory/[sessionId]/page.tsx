import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getSessionForJudge, getSessionForHeadJudge, SensoryAccessError } from "../../../lib/sensory/service";
import { computePanelResultFormAction } from "../../actions/sensory";
import { AssessmentForm } from "../../components/AssessmentForm";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";
import { listarParticipantes, listarInvitables } from "../../../lib/sensory/sessions";
import { InvitarParticipanteForm } from "../../components/sensory/InvitarParticipanteForm";

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
  const scoreFormula = session.protocolVersion.scoreFormula;

  // Los participantes sólo los ve y los mueve quien dirige la cata. Hasta hoy
  // sólo se podían meter a mano en la base, así que una cata la puntuaba quien
  // alguien hubiera metido — o nadie.
  const participantes = canManageSession ? await listarParticipantes(user.userAccountId, sessionId) : [];
  const invitables = canManageSession ? await listarInvitables(user.userAccountId, sessionId) : [];

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

      {canManageSession ? (
        <section className="nn-section">
          <h2>{t("participantsHeading")}</h2>
          {participantes.length === 0 ? (
            <p className="nn-muted">{t("noParticipantsYet")}</p>
          ) : (
            <ul>
              {participantes.map((p) => (
                <li key={p.assignmentId}>
                  {p.displayName} <span className="nn-muted">· {p.perfil}</span>
                </li>
              ))}
            </ul>
          )}
          <InvitarParticipanteForm sessionId={sessionId} invitables={invitables} />
        </section>
      ) : null}

      {session.flights.map((flight) => (
        <section key={flight.id} style={{ marginTop: "2rem" }}>
          <h2>{flight.name}</h2>

          {flight.blindSamples.map((blindSample) => {
            const alreadySubmitted = blindSample.assessments.length > 0;
            const headJudgeSample = headJudgeSamplesByFlight.get(flight.id)?.find((s) => s.id === blindSample.id);
            const preparacion = headJudgeSample?.blindMapping?.roastSession ?? null;
            const edadDelTueste = preparacion ? edadEntre(preparacion.endedAt ?? preparacion.startedAt, session.scheduledAt ?? session.createdAt) : null;

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
                    {preparacion ? (
                      <>
                        <span>{t("servedRoastDate", { date: preparacion.startedAt.toISOString().slice(0, 10) })}</span>
                        <span>{preparacion.recipeVersion ? `${preparacion.recipeVersion.recipe.name} · v${preparacion.recipeVersion.version}` : t("sampleRoastNoProfile")}</span>
                        <span>{preparacion.equipment?.name ?? t("sampleRoastNoEquipment")}</span>
                        {edadDelTueste ? (
                          <span className={edadDelTueste.fuera ? "nn-roast-age-warning" : undefined}>
                            {t("roastAgeAtCupping", { days: edadDelTueste.dias, hours: edadDelTueste.horas })}
                            {edadDelTueste.fuera ? ` · ${t("roastAgeOutsideWindow")}` : ""}
                          </span>
                        ) : null}
                      </>
                    ) : <span className="nn-roast-age-warning">{t("sampleWithoutRoast")}</span>}
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
                      scoreFormula={scoreFormula}
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

function edadEntre(tueste: Date, cata: Date) {
  const totalHoras = Math.max(0, Math.floor((cata.getTime() - tueste.getTime()) / 3_600_000));
  return { dias: Math.floor(totalHoras / 24), horas: totalHoras % 24, fuera: totalHoras < 48 || totalHoras > 14 * 24 };
}
