"use client";

import { CampoNumerico } from "../CampoNumerico";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { startFermentationAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

export function FermentationForm({ lotId, recetaDelProceso }: { lotId: string; recetaDelProceso: string | null }) {
  const [state, formAction, pending] = useActionState(startFermentationAction, initialState);
  const t = useTranslations("Traceability");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotId" value={lotId} />

      {/* Parte 1, R4: la receta es la del proceso que cubre al lote; aquí sólo se lee. */}
      <p className="nn-muted">
        {recetaDelProceso ? t("fermentationRecipeFromProcess", { recipe: recetaDelProceso }) : t("fermentationNoRecipeInProcess")}
      </p>
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
