"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { startFermentationAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

export function FermentationForm({ lotId }: { lotId: string }) {
  const [state, formAction, pending] = useActionState(startFermentationAction, initialState);
  const t = useTranslations("Traceability");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="f-vesselNote">{t("vesselLabel")}</label>
        <input id="f-vesselNote" name="vesselNote" type="text" placeholder="Tank 3" />
      </div>
      <div className="nn-field">
        <label htmlFor="f-quantity">{t("quantityLabel")}</label>
        <input id="f-quantity" name="quantity" type="number" inputMode="decimal" step="0.001" />
      </div>
      <div className="nn-field">
        <label htmlFor="f-unit">{t("unitLabel")}</label>
        <input id="f-unit" name="unit" type="text" placeholder="kg" />
      </div>
      <div className="nn-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
        <input id="f-inoculated" name="inoculated" type="checkbox" style={{ width: "auto" }} />
        <label htmlFor="f-inoculated" style={{ margin: 0 }}>
          {t("inoculatedLabel")}
        </label>
      </div>
      <div className="nn-field">
        <label htmlFor="f-inoculationNote">{t("inoculationNoteLabel")}</label>
        <input id="f-inoculationNote" name="inoculationNote" type="text" />
      </div>
      {state.error ? <p className="nn-error">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("startFermentationButton")}
      </button>
    </form>
  );
}
