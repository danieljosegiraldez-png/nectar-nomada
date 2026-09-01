"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { queueDraft } from "../../../lib/apiary/offlineQueue";
import { APIARY_DRAFTS_CHANGED_EVENT } from "./OfflineSyncIndicator";

/**
 * §1a/§4: three siblings of the Inspection form, not nested inside it —
 * "Log feeding" (material, quantity — two field-taps + submit), "Log
 * treatment" (product, batch label, dose — three field-taps + submit,
 * one more than feeding specifically because treatmentBatchLabel is
 * required), "Log observation" (one free-text field + submit). Each
 * fixes its own eventType; never operator-selected. Always visible, not
 * behind an expand toggle — a beekeeper who only feeds twelve hives in
 * sequence taps "Log feeding" twelve times without re-expanding anything.
 */
export function ColonyEventQuickEntry({ colonyId, selfPersonId }: { colonyId: string; selfPersonId: string | null }) {
  const t = useTranslations("Apiary");

  const [feedingMaterial, setFeedingMaterial] = useState("");
  const [feedingQuantity, setFeedingQuantity] = useState("");
  const [feedingUnit, setFeedingUnit] = useState("kg");
  const [feedingSaved, setFeedingSaved] = useState(false);

  const [treatmentProduct, setTreatmentProduct] = useState("");
  const [treatmentBatchLabel, setTreatmentBatchLabel] = useState("");
  const [treatmentDose, setTreatmentDose] = useState("");
  const [treatmentDoseUnit, setTreatmentDoseUnit] = useState("");
  const [treatmentSaved, setTreatmentSaved] = useState(false);

  const [observationNote, setObservationNote] = useState("");
  const [observationSaved, setObservationSaved] = useState(false);

  // A5.5 §2: one shared error surface — same underlying failure mode (the
  // local IndexedDB write itself failed) regardless of which of the three
  // mini-forms triggered it.
  const [saveError, setSaveError] = useState<string | null>(null);

  async function logFeeding() {
    setSaveError(null);
    try {
      await queueDraft("colonyEvent", {
        colonyId,
        eventType: "feeding",
        occurredAt: new Date(),
        operatorPersonId: selfPersonId,
        feedingMaterial: feedingMaterial.trim() || null,
        feedingQuantity: feedingQuantity.trim() ? Number(feedingQuantity) : null,
        feedingUnit: feedingUnit.trim() || null,
      });
    } catch {
      setSaveError(t("localSaveFailedError"));
      return;
    }
    window.dispatchEvent(new Event(APIARY_DRAFTS_CHANGED_EVENT));
    setFeedingSaved(true);
    setFeedingMaterial("");
    setFeedingQuantity("");
  }

  async function logTreatment() {
    if (!treatmentBatchLabel.trim()) return;
    setSaveError(null);
    try {
      await queueDraft("colonyEvent", {
        colonyId,
        eventType: "treatment",
        occurredAt: new Date(),
        operatorPersonId: selfPersonId,
        treatmentProduct: treatmentProduct.trim() || null,
        treatmentBatchLabel: treatmentBatchLabel.trim(),
        treatmentDose: treatmentDose.trim() ? Number(treatmentDose) : null,
        treatmentDoseUnit: treatmentDoseUnit.trim() || null,
      });
    } catch {
      setSaveError(t("localSaveFailedError"));
      return;
    }
    window.dispatchEvent(new Event(APIARY_DRAFTS_CHANGED_EVENT));
    setTreatmentSaved(true);
    setTreatmentProduct("");
    setTreatmentBatchLabel("");
    setTreatmentDose("");
    setTreatmentDoseUnit("");
  }

  async function logObservation() {
    if (!observationNote.trim()) return;
    setSaveError(null);
    try {
      await queueDraft("colonyEvent", {
        colonyId,
        eventType: "passing_observation",
        occurredAt: new Date(),
        operatorPersonId: selfPersonId,
        note: observationNote.trim(),
      });
    } catch {
      setSaveError(t("localSaveFailedError"));
      return;
    }
    window.dispatchEvent(new Event(APIARY_DRAFTS_CHANGED_EVENT));
    setObservationSaved(true);
    setObservationNote("");
  }

  return (
    <div>
      {saveError ? (
        <p className="nn-error" role="alert" style={{ marginBottom: "0.5rem" }}>
          {saveError}
        </p>
      ) : null}
      <div className="nn-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div className="nn-form" style={{ margin: 0 }}>
          <h4>{t("logFeedingHeading")}</h4>
          <div className="nn-field">
            <label htmlFor={`feed-material-${colonyId}`}>{t("feedingMaterialLabel")}</label>
            <input id={`feed-material-${colonyId}`} value={feedingMaterial} onChange={(e) => setFeedingMaterial(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div className="nn-field" style={{ flex: 1 }}>
              <label htmlFor={`feed-qty-${colonyId}`}>{t("feedingQuantityLabel")}</label>
              <input id={`feed-qty-${colonyId}`} type="number" inputMode="decimal" value={feedingQuantity} onChange={(e) => setFeedingQuantity(e.target.value)} />
            </div>
            <div className="nn-field" style={{ flex: 1 }}>
              <label htmlFor={`feed-unit-${colonyId}`}>{t("unitLabel")}</label>
              <input id={`feed-unit-${colonyId}`} value={feedingUnit} onChange={(e) => setFeedingUnit(e.target.value)} />
            </div>
          </div>
          <button type="button" className="nn-button" onClick={() => void logFeeding()}>
            {t("logFeedingButton")}
          </button>
          {feedingSaved ? <p className="nn-muted">{t("savedLocally")}</p> : null}
        </div>

        <div className="nn-form" style={{ margin: 0 }}>
          <h4>{t("logTreatmentHeading")}</h4>
          <div className="nn-field">
            <label htmlFor={`treat-product-${colonyId}`}>{t("treatmentProductLabel")}</label>
            <input id={`treat-product-${colonyId}`} value={treatmentProduct} onChange={(e) => setTreatmentProduct(e.target.value)} />
          </div>
          <div className="nn-field">
            <label htmlFor={`treat-batch-${colonyId}`}>{t("treatmentBatchLabelLabel")}</label>
            <input id={`treat-batch-${colonyId}`} value={treatmentBatchLabel} onChange={(e) => setTreatmentBatchLabel(e.target.value)} required />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div className="nn-field" style={{ flex: 1 }}>
              <label htmlFor={`treat-dose-${colonyId}`}>{t("treatmentDoseLabel")}</label>
              <input id={`treat-dose-${colonyId}`} type="number" inputMode="decimal" value={treatmentDose} onChange={(e) => setTreatmentDose(e.target.value)} />
            </div>
            <div className="nn-field" style={{ flex: 1 }}>
              <label htmlFor={`treat-dose-unit-${colonyId}`}>{t("unitLabel")}</label>
              <input id={`treat-dose-unit-${colonyId}`} value={treatmentDoseUnit} onChange={(e) => setTreatmentDoseUnit(e.target.value)} />
            </div>
          </div>
          <button type="button" className="nn-button" onClick={() => void logTreatment()} disabled={!treatmentBatchLabel.trim()}>
            {t("logTreatmentButton")}
          </button>
          {treatmentSaved ? <p className="nn-muted">{t("savedLocally")}</p> : null}
        </div>

        <div className="nn-form" style={{ margin: 0 }}>
          <h4>{t("logObservationHeading")}</h4>
          <div className="nn-field">
            <label htmlFor={`obs-note-${colonyId}`}>{t("noteLabel")}</label>
            <textarea id={`obs-note-${colonyId}`} value={observationNote} onChange={(e) => setObservationNote(e.target.value)} rows={2} />
          </div>
          <button type="button" className="nn-button" onClick={() => void logObservation()} disabled={!observationNote.trim()}>
            {t("logObservationButton")}
          </button>
          {observationSaved ? <p className="nn-muted">{t("savedLocally")}</p> : null}
        </div>
      </div>
    </div>
  );
}
