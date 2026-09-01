"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { startDryingAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

export function DryingForm({ lotId }: { lotId: string }) {
  const [state, formAction, pending] = useActionState(startDryingAction, initialState);
  const t = useTranslations("Traceability");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="d-method">{t("dryingMethodLabel")}</label>
        <input id="d-method" name="method" type="text" placeholder="raised_bed, patio, mechanical" />
      </div>
      <div className="nn-field">
        <label htmlFor="d-layerDepthCm">{t("layerDepthLabel")}</label>
        <input id="d-layerDepthCm" name="layerDepthCm" type="number" inputMode="decimal" step="0.1" />
      </div>
      <div className="nn-field">
        <label htmlFor="d-quantity">{t("quantityLabel")}</label>
        <input id="d-quantity" name="quantity" type="number" inputMode="decimal" step="0.001" />
      </div>
      <div className="nn-field">
        <label htmlFor="d-unit">{t("unitLabel")}</label>
        <input id="d-unit" name="unit" type="text" placeholder="kg" />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("startDryingButton")}
      </button>
    </form>
  );
}
