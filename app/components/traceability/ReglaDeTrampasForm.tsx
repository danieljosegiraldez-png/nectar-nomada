"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveTrapRuleFormAction, type TraceabilityActionState } from "../../actions/traceability";
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";

const NIVELES = ["ninguno", "pocos", "algunos", "muchos"] as const;

const initialState: TraceabilityActionState = {};

export interface ReglaActual {
  triggerLevel: (typeof NIVELES)[number];
  normalDays: number;
  alertDays: number;
  suggestedAction: string;
}

/**
 * La regla de trampas de la finca — F2 §5. Una por finca: guardar otra vez la
 * reemplaza.
 *
 * **Sin regla guardada los campos salen vacíos**, no con el quincenal de
 * ninguna guía: un valor precargado se guardaría aunque nadie lo decidiera.
 * Con regla, salen con la que hay.
 */
export function ReglaDeTrampasForm({
  locationId,
  farmLocationId,
  regla,
}: {
  locationId: string;
  farmLocationId: string;
  regla: ReglaActual | null;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(saveTrapRuleFormAction, initialState);
  const id = (campo: string) => `${campo}-${farmLocationId}`;

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />
      <input type="hidden" name="farmLocationId" value={farmLocationId} />

      <div className="nn-field">
        <label htmlFor={id("triggerLevel")}>{t("trapRuleTrigger")}</label>
        <select id={id("triggerLevel")} name="triggerLevel" required defaultValue={regla?.triggerLevel ?? ""}>
          <option value="">{t("trapCheckLevelChoose")}</option>
          {NIVELES.map((n) => (
            <option key={n} value={n}>
              {t(`trapsLevel_${n}`)}
            </option>
          ))}
        </select>
        <p className="nn-detail-meta">{t("trapRuleTriggerHint")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor={id("normalDays")}>{t("trapRuleNormalDays")}</label>
        <input
          id={id("normalDays")}
          type="number"
          name="normalDays"
          min="1"
          step="1"
          inputMode="numeric"
          required
          defaultValue={regla?.normalDays ?? ""}
        />
      </div>

      <div className="nn-field">
        <label htmlFor={id("alertDays")}>{t("trapRuleAlertDays")}</label>
        <input
          id={id("alertDays")}
          type="number"
          name="alertDays"
          min="1"
          step="1"
          inputMode="numeric"
          required
          defaultValue={regla?.alertDays ?? ""}
        />
      </div>

      <div className="nn-field">
        <label htmlFor={id("suggestedAction")}>{t("trapRuleAction")}</label>
        <input
          id={id("suggestedAction")}
          type="text"
          name="suggestedAction"
          required
          defaultValue={regla?.suggestedAction ?? ""}
        />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <BotonQueNecesitaConexion pending={pending}>{t("trapRuleSave")}</BotonQueNecesitaConexion>
    </form>
  );
}
