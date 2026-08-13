"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recordMeasurementAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

// §10.3's six Measurement-routed variables — weight is deliberately absent
// (routed through QuantityEvent, not here, per T3's own design).
const VARIABLES = ["temperature", "ph", "brix", "relative_humidity", "moisture", "water_activity"] as const;

// T9.5 §3(c)/§4: the subset of ProvenanceClass that's actually plausible for
// a raw field measurement — not the full ten-value vocabulary (hypothesis,
// conclusion, recommendation, ai_suggestion, original_record belong to
// other layers of the system, not a moisture reading at the drying beds).
// measured_fact first/default: Phase 1's only source type is "manual"
// (§10.2), i.e. an operator reading an instrument — a thermometer,
// refractometer, pH meter, moisture meter — which is a measured fact, not
// an unqualified claim (T9.5 §3(b)'s "harvest weight read off a scale"
// reasoning extends the same way here).
const PROVENANCE_CLASSES = ["measured_fact", "direct_observation", "interpretation", "scientific_evidence"] as const;

interface ObserverOption {
  id: string;
  displayName: string;
}

export function MeasurementForm({
  lotId,
  observers,
  selfPersonId,
  fermentationRunId,
  dryingRunId,
  storageAssignmentId,
}: {
  lotId: string;
  observers: ObserverOption[];
  selfPersonId: string | null;
  // Pre-existing gap fix: the Lot Detail page already knows which of these
  // (if any) is the lot's current active context — same activeFermentation/
  // activeDrying/currentStorage it uses for the other contextual forms on
  // that page. At most one is ever non-null for a given lot at a time.
  fermentationRunId?: string | null;
  dryingRunId?: string | null;
  storageAssignmentId?: string | null;
}) {
  const [state, formAction, pending] = useActionState(recordMeasurementAction, initialState);
  const t = useTranslations("Traceability");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480, marginTop: "1rem" }}>
      <input type="hidden" name="lotId" value={lotId} />
      {fermentationRunId ? <input type="hidden" name="fermentationRunId" value={fermentationRunId} /> : null}
      {dryingRunId ? <input type="hidden" name="dryingRunId" value={dryingRunId} /> : null}
      {storageAssignmentId ? <input type="hidden" name="storageAssignmentId" value={storageAssignmentId} /> : null}
      <div className="nn-field">
        <label htmlFor="variable">{t("variableLabel")}</label>
        <select id="variable" name="variable" defaultValue="temperature">
          {VARIABLES.map((variable) => (
            <option key={variable} value={variable}>
              {t(`variable_${variable}` as "variable_temperature")}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="value">{t("valueLabel")}</label>
        <input id="value" name="value" type="number" step="0.01" required />
      </div>
      <div className="nn-field">
        <label htmlFor="unit">{t("unitLabel")}</label>
        <input id="unit" name="unit" type="text" required placeholder="C, pH, Bx, %, aw" />
      </div>
      <div className="nn-field">
        <label htmlFor="provenanceClass">{t("provenanceClassLabel")}</label>
        <select id="provenanceClass" name="provenanceClass" defaultValue="measured_fact">
          {PROVENANCE_CLASSES.map((cls) => (
            <option key={cls} value={cls}>
              {t(`provenanceClass_${cls}` as "provenanceClass_measured_fact")}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="operatorPersonId">{t("observerLabel")}</label>
        <select id="operatorPersonId" name="operatorPersonId" defaultValue={selfPersonId ?? ""}>
          {observers.map((person) => (
            <option key={person.id} value={person.id}>
              {person.id === selfPersonId ? t("observerSelfOption", { name: person.displayName }) : person.displayName}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="notes">{t("notesLabel")}</label>
        <textarea id="notes" name="notes" rows={2} />
      </div>
      {state.error ? <p className="nn-error">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("recordMeasurementButton")}
      </button>
    </form>
  );
}
