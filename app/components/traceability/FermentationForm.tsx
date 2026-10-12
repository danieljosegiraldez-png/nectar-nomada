"use client";

import { CampoNumerico } from "../CampoNumerico";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { startFermentationAction, type TraceabilityActionState } from "../../actions/traceability";
import type { OpcionDeRecipiente } from "../../../lib/equipos/equipos";

const initialState: TraceabilityActionState = {};

export function FermentationForm({
  lotId,
  recetaDelProceso,
  recipientes,
}: {
  lotId: string;
  recetaDelProceso: string | null;
  recipientes: OpcionDeRecipiente[];
}) {
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
        <label htmlFor="f-vesselEquipmentId">{t("vesselLabel")}</label>
        <select id="f-vesselEquipmentId" name="vesselEquipmentId" defaultValue="">
          <option value="">{t("vesselNoneOption")}</option>
          {recipientes.map((r) => {
            // Un tanque ocupado o con condición pendiente se ofrece igual (C1/E1): el estado va detrás del nombre.
            const estados = [
              ...(r.motivos.includes("EN_USO") ? [t("vesselStateInUse")] : []),
              ...(r.motivos.includes("CONDICION") ? [t("vesselStateNeedsAttention")] : []),
            ];
            return (
              <option key={r.id} value={r.id}>
                {estados.length > 0 ? `${r.label} · ${estados.join(", ")}` : r.label}
              </option>
            );
          })}
        </select>
        <p className="nn-muted">{t("vesselHint")}</p>
      </div>
      {/* D2 (2026-10-04): el nombre escrito es la vía para un tanque que no está registrado; sale abierto cuando no hay ninguno que elegir. */}
      <details open={recipientes.length === 0}>
        <summary>{t("vesselNoteSummary")}</summary>
        <div className="nn-field">
          <label htmlFor="f-vesselNote">{t("vesselNoteLabel")}</label>
          <input id="f-vesselNote" name="vesselNote" type="text" />
        </div>
      </details>
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
