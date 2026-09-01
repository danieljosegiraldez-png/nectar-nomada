"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createSampleAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

export function SampleForm({ lotId }: { lotId: string }) {
  const [state, formAction, pending] = useActionState(createSampleAction, initialState);
  const t = useTranslations("Traceability");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="sm-sampleCode">{t("sampleCodeLabel")}</label>
        <input id="sm-sampleCode" name="sampleCode" type="text" required />
      </div>
      <div className="nn-field">
        <label htmlFor="sm-sampleType">{t("sampleTypeLabel")}</label>
        <input id="sm-sampleType" name="sampleType" type="text" required placeholder="green_coffee" />
      </div>
      <div className="nn-field">
        <label htmlFor="sm-quantity">{t("quantityLabel")}</label>
        <input id="sm-quantity" name="quantity" type="number" inputMode="decimal" step="0.001" />
      </div>
      <div className="nn-field">
        <label htmlFor="sm-unit">{t("unitLabel")}</label>
        <input id="sm-unit" name="unit" type="text" placeholder="kg" />
      </div>
      <div className="nn-field">
        <label htmlFor="sm-notes">{t("notesLabel")}</label>
        <textarea id="sm-notes" name="notes" rows={2} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("createSampleButton")}
      </button>
    </form>
  );
}
