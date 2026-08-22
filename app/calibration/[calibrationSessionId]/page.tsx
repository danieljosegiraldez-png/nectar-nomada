import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import {
  getCalibrationSessionDetail,
  getCalibrationFormOptions,
  CalibrationAccessError,
} from "../../../lib/sensory/calibration";
import { recordCalibrationResultFormAction } from "../../actions/calibration";

export const dynamic = "force-dynamic";

export default async function CalibrationSessionPage({
  params,
}: {
  params: Promise<{ calibrationSessionId: string }>;
}) {
  const { calibrationSessionId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Calibration");

  let session, formOptions;
  try {
    [session, formOptions] = await Promise.all([
      getCalibrationSessionDetail(user.userAccountId, calibrationSessionId),
      getCalibrationFormOptions(user.userAccountId),
    ]);
  } catch (error) {
    if (error instanceof CalibrationAccessError) {
      notFound();
    }
    throw error;
  }

  return (
    <div>
      <Link href="/calibration" className="nn-back-link">
        {t("backToCalibration")}
      </Link>

      <h1>
        {session.category} — {new Date(session.sessionDate).toLocaleDateString()}
      </h1>
      {session.conductedByPerson ? (
        <p className="nn-muted">{t("conductedByLabel", { name: session.conductedByPerson.displayName })}</p>
      ) : null}
      {session.notes ? <p className="nn-muted">{session.notes}</p> : null}

      <section className="nn-section">
        <h2>{t("resultsHeading")}</h2>
        {session.results.length === 0 ? (
          <p className="nn-muted">{t("noResults")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {session.results.map((result) => (
              <li key={result.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "0.75rem" }}>
                <p style={{ margin: 0 }}>
                  <strong>{result.evaluatorPerson.displayName}</strong> — {result.referenceStandard.compoundName}
                </p>
                <p className="nn-muted" style={{ margin: 0 }}>
                  {result.correctlyIdentified ? t("correctlyIdentified") : t("notCorrectlyIdentified")}
                  {result.perceivedDescriptorGiven ? ` · "${result.perceivedDescriptorGiven}"` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("recordResultHeading")}</h2>
        <form action={recordCalibrationResultFormAction} className="nn-form">
          <input type="hidden" name="calibrationSessionId" value={session.id} />
          <select name="evaluatorPersonId" required defaultValue="">
            <option value="" disabled>
              {t("evaluatorSelectPlaceholder")}
            </option>
            {formOptions.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.displayName}
              </option>
            ))}
          </select>
          <select name="referenceStandardId" required defaultValue="">
            <option value="" disabled>
              {t("referenceStandardSelectPlaceholder")}
            </option>
            {formOptions.referenceStandards.map((standard) => (
              <option key={standard.id} value={standard.id}>
                {standard.compoundName} ({standard.category})
              </option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" name="correctlyIdentified" />
            {t("correctlyIdentifiedLabel")}
          </label>
          <input type="text" name="perceivedDescriptorGiven" placeholder={t("perceivedDescriptorPlaceholder")} />
          <input type="number" inputMode="decimal" step="any" name="perceivedIntensityRating" placeholder={t("perceivedIntensityPlaceholder")} />
          <input type="number" inputMode="decimal" step="any" name="actualConcentrationPresented" placeholder={t("actualConcentrationPlaceholder")} />
          <textarea name="notes" placeholder={t("notesPlaceholder")} />
          <button type="submit" className="nn-button">
            {t("recordResultButton")}
          </button>
        </form>
      </section>
    </div>
  );
}
