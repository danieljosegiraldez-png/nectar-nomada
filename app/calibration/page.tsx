import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { getReferenceStandards, getCalibrationSessions, CalibrationAccessError } from "../../lib/sensory/calibration";
import { createReferenceStandardFormAction, createCalibrationSessionFormAction } from "../actions/calibration";

export const dynamic = "force-dynamic";

export default async function CalibrationPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Calibration");

  let referenceStandards, calibrationSessions;
  try {
    [referenceStandards, calibrationSessions] = await Promise.all([
      getReferenceStandards(user.userAccountId),
      getCalibrationSessions(user.userAccountId),
    ]);
  } catch (error) {
    if (error instanceof CalibrationAccessError) {
      return (
        <div>
          <span className="nn-badge">{t("badge")}</span>
          <h1>{t("title")}</h1>
          <p className="nn-muted">{t("noAccess")}</p>
        </div>
      );
    }
    throw error;
  }

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("title")}</h1>
      <p className="nn-muted">{t("intro")}</p>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("referenceStandardsHeading")}</h2>
        {referenceStandards.length === 0 ? (
          <p className="nn-muted">{t("noReferenceStandards")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {referenceStandards.map((standard) => (
              <li key={standard.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "0.75rem" }}>
                <p style={{ margin: 0 }}>
                  <strong>{standard.compoundName}</strong> — {standard.sensoryDescriptor} ({standard.category})
                </p>
                <p className="nn-muted" style={{ margin: 0 }}>
                  {t(`standardOrigin_${standard.standardOrigin}` as "standardOrigin_commercial_third_party")}
                  {standard.supplierOrganization ? ` · ${standard.supplierOrganization.name}` : ""}
                  {standard.typicalThresholdValue != null
                    ? ` · ${standard.typicalThresholdValue.toString()} ${standard.thresholdUnit ?? ""}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}

        <details style={{ marginTop: "1rem" }}>
          <summary>{t("addReferenceStandardSummary")}</summary>
          <form action={createReferenceStandardFormAction} className="nn-form" style={{ marginTop: "1rem" }}>
            <input type="text" name="compoundName" placeholder={t("compoundNamePlaceholder")} required />
            <input type="text" name="sensoryDescriptor" placeholder={t("sensoryDescriptorPlaceholder")} required />
            <input type="text" name="category" placeholder={t("categoryPlaceholder")} required />
            <select name="standardOrigin" defaultValue="commercial_third_party">
              <option value="commercial_third_party">{t("standardOrigin_commercial_third_party")}</option>
              <option value="self_created">{t("standardOrigin_self_created")}</option>
              <option value="adapted_from_commercial">{t("standardOrigin_adapted_from_commercial")}</option>
            </select>
            <input type="number" inputMode="decimal" step="any" name="typicalThresholdValue" placeholder={t("thresholdValuePlaceholder")} />
            <input type="text" name="thresholdUnit" placeholder={t("thresholdUnitPlaceholder")} />
            <input type="text" name="supplierProductReference" placeholder={t("supplierProductReferencePlaceholder")} />
            <input type="text" name="dataSheetReference" placeholder={t("dataSheetReferencePlaceholder")} />
            <textarea name="notes" placeholder={t("notesPlaceholder")} />
            <button type="submit" className="nn-button">
              {t("addReferenceStandardButton")}
            </button>
          </form>
        </details>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("calibrationSessionsHeading")}</h2>
        {calibrationSessions.length === 0 ? (
          <p className="nn-muted">{t("noCalibrationSessions")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {calibrationSessions.map((session) => (
              <li key={session.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "0.75rem" }}>
                <Link href={`/calibration/${session.id}`}>
                  {session.category} — {new Date(session.sessionDate).toLocaleDateString()} ({session.results.length}{" "}
                  {t("resultsCountSuffix")})
                </Link>
              </li>
            ))}
          </ul>
        )}

        <details style={{ marginTop: "1rem" }}>
          <summary>{t("addCalibrationSessionSummary")}</summary>
          <form action={createCalibrationSessionFormAction} className="nn-form" style={{ marginTop: "1rem" }}>
            <input type="date" name="sessionDate" required />
            <input type="text" name="category" placeholder={t("categoryPlaceholder")} required />
            <textarea name="notes" placeholder={t("notesPlaceholder")} />
            <button type="submit" className="nn-button">
              {t("addCalibrationSessionButton")}
            </button>
          </form>
        </details>
      </section>
    </div>
  );
}
