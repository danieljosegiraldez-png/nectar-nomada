"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createPlotBlockFormAction, type TraceabilityActionState } from "../../actions/traceability";
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";

const initialState: TraceabilityActionState = {};

/** Crear un bloque de la parcela — F2 §3. Nombre y nota; necesita conexión. */
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
        <label htmlFor={`blockNotes-${locationId}`}>{t("notesLabel")}</label>
        <input id={`blockNotes-${locationId}`} type="text" name="notes" placeholder={t("notRecorded")} />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <BotonQueNecesitaConexion pending={pending}>{t("blockNewSave")}</BotonQueNecesitaConexion>
    </form>
  );
}
