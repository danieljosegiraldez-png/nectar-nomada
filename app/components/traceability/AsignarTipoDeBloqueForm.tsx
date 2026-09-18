"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { setPlotBlockTypeFormAction, type TraceabilityActionState } from "../../actions/traceability";
import { TIPOS_DE_BLOQUE } from "../../../lib/traceability/tiposDeBloque";

const initialState: TraceabilityActionState = {};

/**
 * Elegir el tipo de un bloque que se creó antes de que `blockType` existiera
 * (ADR-080: nació NULL, no se le supone un tipo). Sólo aparece para bloques sin tipo.
 */
export function AsignarTipoDeBloqueForm({
  locationId,
  plotBlockId,
}: {
  locationId: string;
  plotBlockId: string;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(setPlotBlockTypeFormAction, initialState);

  return (
    <details>
      <summary>{t("blockTypeAssignSummary")}</summary>
      <form action={formAction} className="nn-form">
        <input type="hidden" name="locationId" value={locationId} />
        <input type="hidden" name="plotBlockId" value={plotBlockId} />
        <div className="nn-field">
          <select name="blockType" required defaultValue="">
            <option value="">{t("blockTypeChoose")}</option>
            {TIPOS_DE_BLOQUE.map((tipo) => (
              <option key={tipo} value={tipo}>
                {t(`blockType_${tipo}` as "blockType_microparcela")}
              </option>
            ))}
          </select>
        </div>
        {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
        <button type="submit" className="nn-button" disabled={pending}>
          {t("blockTypeAssignSave")}
        </button>
      </form>
    </details>
  );
}
