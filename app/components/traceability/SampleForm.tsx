"use client";

import { CampoNumerico } from "../CampoNumerico";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createSampleAction, type TraceabilityActionState } from "../../actions/traceability";
import { MATERIALES } from "../../../lib/traceability/avisoDeModo";

const initialState: TraceabilityActionState = {};

export function SampleForm({ lotId, greenCoffee = false }: { lotId: string; greenCoffee?: boolean }) {
  const [state, formAction, pending] = useActionState(createSampleAction, initialState);
  const t = useTranslations("Traceability");
  const [grams, setGrams] = useState("");
  const gramValue = Number(grams);
  const outsideTypicalRange = greenCoffee && Number.isFinite(gramValue) && gramValue > 0 && (gramValue < 100 || gramValue > 1000);

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="sm-sampleCode">{t("sampleCodeLabel")}</label>
        <input id="sm-sampleCode" name="sampleCode" type="text" required />
      </div>
      {greenCoffee ? (
        <>
          <input type="hidden" name="sampleType" value="green_coffee" />
          <input type="hidden" name="materialState" value="GREEN" />
          <div className="nn-field">
            <label htmlFor="sm-grams">{t("greenSampleQuantityGrams")}</label>
            <CampoNumerico id="sm-grams" name="quantityGrams" inputMode="decimal" step="1" min="1" required value={grams} onChange={(event) => setGrams(event.target.value)} />
            <span className="nn-muted">{t("greenSampleTypicalRange")}</span>
            {outsideTypicalRange ? <span className="nn-green-sample-warning" role="status">{t("greenSampleOutsideTypicalRange")}</span> : null}
          </div>
        </>
      ) : (
        <>
          <div className="nn-field">
            <label htmlFor="sm-sampleType">{t("sampleTypeLabel")}</label>
            <input id="sm-sampleType" name="sampleType" type="text" required placeholder="green_coffee" />
          </div>
          <div className="nn-field">
            <label htmlFor="sm-materialState">{t("materialStateLabel")}</label>
            <select id="sm-materialState" name="materialState" defaultValue="">
              <option value="">{t("notDeclaredOption")}</option>
              {MATERIALES.map((m) => <option key={m} value={m}>{t(`material_${m}`)}</option>)}
            </select>
          </div>
          <div className="nn-field"><label htmlFor="sm-quantity">{t("quantityLabel")}</label><CampoNumerico id="sm-quantity" name="quantity" inputMode="decimal" step="0.001" /></div>
          <div className="nn-field"><label htmlFor="sm-unit">{t("unitLabel")}</label><input id="sm-unit" name="unit" type="text" placeholder="kg" /></div>
        </>
      )}
      <div className="nn-field">
        <label htmlFor="sm-notes">{t("notesLabel")}</label>
        <textarea id="sm-notes" name="notes" rows={2} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {pending ? t("greenSampleSaving") : greenCoffee ? t("greenSampleSubmit") : t("createSampleButton")}
      </button>
    </form>
  );
}
