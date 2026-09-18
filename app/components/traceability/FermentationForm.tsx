"use client";

import { CampoNumerico } from "../CampoNumerico";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { startFermentationAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

export function FermentationForm({ lotId , recipeVersions = [] }: { lotId: string ; recipeVersions?: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState(startFermentationAction, initialState);
  const t = useTranslations("Traceability");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotId" value={lotId} />

      {/* ADR-099. Offered only when approved recipes exist for this batch's
          organization — an empty select is a question with no answers. */}
      {recipeVersions.length > 0 ? (
        <div className="nn-field">
          <label htmlFor="f-recipe">{t("recipeLabel")}</label>
          <select id="f-recipe" name="processRecipeVersionId" defaultValue="">
            <option value="">{t("recipeNoneOption")}</option>
            {recipeVersions.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
          <p className="nn-muted" style={{ fontSize: "0.85em", margin: "0.25rem 0 0" }}>{t("recipeHint")}</p>
        </div>
      ) : null}
      <div className="nn-field">
        <label htmlFor="f-vesselNote">{t("vesselLabel")}</label>
        <input id="f-vesselNote" name="vesselNote" type="text" placeholder="Tank 3" />
      </div>
      <div className="nn-field">
        <label htmlFor="f-quantity">{t("quantityLabel")}</label>
        <CampoNumerico id="f-quantity" name="quantity" inputMode="decimal" step="0.001" />
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
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("startFermentationButton")}
      </button>
    </form>
  );
}
