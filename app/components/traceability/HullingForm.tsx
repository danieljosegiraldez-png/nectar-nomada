"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recordHullingAction, type TraceabilityActionState } from "../../actions/traceability";
import { CampoNumerico } from "../CampoNumerico";
import { TimezoneOffsetField } from "../TimezoneOffsetField";

const initialState: TraceabilityActionState = {};

export function HullingForm({ lotId, locations, defaultLocationId }: {
  lotId: string;
  locations: Array<{ id: string; name: string }>;
  defaultLocationId: string | null;
}) {
  const [state, formAction, pending] = useActionState(recordHullingAction, initialState);
  const t = useTranslations("Traceability");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 540 }}>
      <TimezoneOffsetField />
      <input type="hidden" name="lotId" value={lotId} />

      <div className="nn-field">
        <label htmlFor="hu-occurredAt">{t("hullingDate")}</label>
        <input id="hu-occurredAt" name="occurredAt" type="datetime-local" required />
      </div>
      <div className="nn-field">
        <label htmlFor="hu-input">{t("hullingInputKg")}</label>
        <CampoNumerico id="hu-input" name="masaEntradaKg" inputMode="decimal" step="0.001" required />
      </div>
      <div className="nn-field">
        <label htmlFor="hu-code">{t("hullingGreenLotCode")}</label>
        <input id="hu-code" name="lotCode" required />
      </div>
      <div className="nn-field">
        <label htmlFor="hu-green">{t("hullingGreenKg")}</label>
        <CampoNumerico id="hu-green" name="masaVerdeKg" inputMode="decimal" step="0.001" required />
      </div>

      <details>
        <summary>{t("hullingBalanceDetails")}</summary>
        <div className="nn-field">
          <label htmlFor="hu-husk">{t("hullingHuskKg")}</label>
          <CampoNumerico id="hu-husk" name="cascarillaKg" inputMode="decimal" step="0.001" min="0" required />
        </div>
        <div className="nn-field">
          <label htmlFor="hu-loss">{t("hullingLossKg")}</label>
          <CampoNumerico id="hu-loss" name="mermaKg" inputMode="decimal" step="0.001" min="0" required />
        </div>
      </details>

      <div className="nn-field">
        <label htmlFor="hu-location">{t("hullingLocation")}</label>
        <select id="hu-location" name="producedAtLocationId" defaultValue={defaultLocationId ?? ""} required>
          <option value="" disabled>{t("selectLocationOption")}</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="hu-notes">{t("notesLabel")}</label>
        <textarea id="hu-notes" name="notes" rows={3} />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {pending ? t("hullingSaving") : t("hullingSubmit")}
      </button>
    </form>
  );
}
