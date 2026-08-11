"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recordMeasurementAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

// §10.3's six Measurement-routed variables — weight is deliberately absent
// (routed through QuantityEvent, not here, per T3's own design).
const VARIABLES = ["temperature", "ph", "brix", "relative_humidity", "moisture", "water_activity"] as const;

export function MeasurementForm({ lotId }: { lotId: string }) {
  const [state, formAction, pending] = useActionState(recordMeasurementAction, initialState);
  const t = useTranslations("Traceability");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480, marginTop: "1rem" }}>
      <input type="hidden" name="lotId" value={lotId} />
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
