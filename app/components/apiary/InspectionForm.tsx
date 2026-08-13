"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { queueDraft } from "../../../lib/apiary/offlineQueue";
import { APIARY_DRAFTS_CHANGED_EVENT } from "./OfflineSyncIndicator";

/**
 * §4's own design, revised (22_APIARY_V1_SCOPING_REPORT.md): one tap on
 * "Nothing unusual" submits immediately — occurredAt=now, operator=self,
 * outcome=nothing_unusual, everything else null. A secondary, visually
 * smaller "Record details" control expands the exceptional case. Neither
 * path ever touches the network directly: both write to the local draft
 * queue first (offlineQueue.queueDraft), which is what makes the one-tap
 * case feel instant regardless of signal, and is what makes submission
 * itself never fail — only the later sync can.
 */
export function InspectionForm({ colonyId, selfPersonId }: { colonyId: string; selfPersonId: string | null }) {
  const t = useTranslations("Apiary");
  const [showDetails, setShowDetails] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [brood, setBrood] = useState("");
  const [queenSighted, setQueenSighted] = useState(false);
  const [stores, setStores] = useState("");
  const [temperament, setTemperament] = useState("");
  const [pest, setPest] = useState("");
  const [note, setNote] = useState("");

  async function submitRoutine() {
    setSaveError(null);
    try {
      await queueDraft("inspection", {
        colonyId,
        occurredAt: new Date(),
        operatorPersonId: selfPersonId,
        outcome: "nothing_unusual",
      });
    } catch {
      // A5.5 §2: the local write itself failed (e.g. storage quota) — the
      // operator must see this now, not discover a missing entry later.
      setSaveError(t("localSaveFailedError"));
      return;
    }
    window.dispatchEvent(new Event(APIARY_DRAFTS_CHANGED_EVENT));
    setSavedMessage(t("inspectionSavedLocally"));
  }

  async function submitDetails() {
    setSaveError(null);
    try {
      await queueDraft("inspection", {
        colonyId,
        occurredAt: new Date(),
        operatorPersonId: selfPersonId,
        outcome: "issue_observed",
        broodPatternNote: brood.trim() || null,
        queenSighted,
        storesLevel: stores.trim() || null,
        temperamentNote: temperament.trim() || null,
        pestDiseaseFlags: pest.trim() || null,
        note: note.trim() || null,
      });
    } catch {
      setSaveError(t("localSaveFailedError"));
      return;
    }
    window.dispatchEvent(new Event(APIARY_DRAFTS_CHANGED_EVENT));
    setSavedMessage(t("inspectionSavedLocally"));
    setShowDetails(false);
    setBrood("");
    setQueenSighted(false);
    setStores("");
    setTemperament("");
    setPest("");
    setNote("");
  }

  return (
    <div className="nn-form" style={{ maxWidth: 420 }}>
      <button
        type="button"
        className="nn-button"
        style={{ fontSize: "1.1rem", padding: "0.75rem" }}
        onClick={() => void submitRoutine()}
      >
        {t("inspectionNothingUnusualButton")}
      </button>

      {!showDetails ? (
        <button type="button" onClick={() => setShowDetails(true)} style={{ marginTop: "0.5rem" }}>
          {t("inspectionRecordDetailsButton")}
        </button>
      ) : (
        <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div className="nn-field">
            <label htmlFor={`insp-brood-${colonyId}`}>{t("broodPatternLabel")}</label>
            <input id={`insp-brood-${colonyId}`} value={brood} onChange={(e) => setBrood(e.target.value)} />
          </div>
          <div className="nn-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
            <input
              id={`insp-queen-${colonyId}`}
              type="checkbox"
              style={{ width: "auto" }}
              checked={queenSighted}
              onChange={(e) => setQueenSighted(e.target.checked)}
            />
            <label htmlFor={`insp-queen-${colonyId}`} style={{ margin: 0 }}>
              {t("queenSightedLabel")}
            </label>
          </div>
          <div className="nn-field">
            <label htmlFor={`insp-stores-${colonyId}`}>{t("storesLevelLabel")}</label>
            <input id={`insp-stores-${colonyId}`} value={stores} onChange={(e) => setStores(e.target.value)} />
          </div>
          <div className="nn-field">
            <label htmlFor={`insp-temperament-${colonyId}`}>{t("temperamentLabel")}</label>
            <input id={`insp-temperament-${colonyId}`} value={temperament} onChange={(e) => setTemperament(e.target.value)} />
          </div>
          <div className="nn-field">
            <label htmlFor={`insp-pest-${colonyId}`}>{t("pestDiseaseFlagsLabel")}</label>
            <input id={`insp-pest-${colonyId}`} value={pest} onChange={(e) => setPest(e.target.value)} />
          </div>
          <div className="nn-field">
            <label htmlFor={`insp-note-${colonyId}`}>{t("noteLabel")}</label>
            <textarea id={`insp-note-${colonyId}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="nn-button" onClick={() => void submitDetails()}>
              {t("inspectionRecordButton")}
            </button>
            <button type="button" onClick={() => setShowDetails(false)}>
              {t("cancelButton")}
            </button>
          </div>
        </div>
      )}

      {savedMessage ? (
        <p className="nn-muted" style={{ marginTop: "0.5rem" }}>
          {savedMessage}
        </p>
      ) : null}
      {saveError ? (
        <p className="nn-error" style={{ marginTop: "0.5rem" }}>
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
