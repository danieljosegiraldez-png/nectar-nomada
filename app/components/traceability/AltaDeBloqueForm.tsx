"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createPlotBlockFormAction, type TraceabilityActionState } from "../../actions/traceability";
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";

const initialState: TraceabilityActionState = {};

const TIPOS = ["microparcela", "trampa", "experimental"] as const;

/** Crear un bloque de la parcela — F2 §3 extendido. Nombre, tipo, descripción y nota; necesita conexión. */
export function AltaDeBloqueForm({ locationId }: { locationId: string }) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(createPlotBlockFormAction, initialState);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />

      <div className="nn-field">
        <label htmlFor={`blockName-${locationId}`}>{t("blockName")}</label>
        <input id={`blockName-${locationId}`} type="text" name="name" required />
      </div>

      <div className="nn-field">
        <label htmlFor={`blockType-${locationId}`}>{t("blockTypeLabel")}</label>
        <select id={`blockType-${locationId}`} name="blockType" required defaultValue="">
          <option value="">{t("blockTypeChoose")}</option>
          {TIPOS.map((tipo) => (
            <option key={tipo} value={tipo}>
              {t(`blockType_${tipo}` as "blockType_microparcela")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`blockDescription-${locationId}`}>{t("blockDescriptionLabel")}</label>
        <input
          id={`blockDescription-${locationId}`}
          type="text"
          name="description"
          placeholder={t("notRecorded")}
        />
      </div>

      <div className="nn-field">
        <label htmlFor={`blockNotes-${locationId}`}>{t("notesLabel")}</label>
        <input id={`blockNotes-${locationId}`} type="text" name="notes" placeholder={t("notRecorded")} />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <BotonQueNecesitaConexion pending={pending}>{t("blockNewSave")}</BotonQueNecesitaConexion>
    </form>
  );
}
