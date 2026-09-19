"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createTrapFormAction, type TrapActionState } from "../../actions/traceability";
import { PROCEDENCIA_DE_REGISTRO_DE_CAMPO } from "../../../lib/traceability/procedencia";
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";

// Misma lista local que `MarcarEnProduccionForm.tsx`.
const DATA_QUALITIES = ["verified", "provisional", "unconfirmed", "not_tested"] as const;

const initialState: TrapActionState = {};

/**
 * Alta de una trampa — F2 §4. El número lo pone el sistema, correlativo por
 * finca; tras guardar se enseña para rotularlo en la botella. El bloque es
 * opcional. Necesita conexión: no se encola.
 */
export function AltaDeTrampaForm({
  locationId,
  bloques,
}: {
  locationId: string;
  bloques: { id: string; name: string }[];
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(createTrapFormAction, initialState);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />

      <div className="nn-field">
        <label htmlFor={`trapBlock-${locationId}`}>{t("trapBlockLabel")}</label>
        <select id={`trapBlock-${locationId}`} name="plotBlockId" defaultValue="">
          <option value="">{t("trapsNoBlock")}</option>
          {bloques.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`trapInstalledAt-${locationId}`}>{t("trapInstalledAt")}</label>
        <input id={`trapInstalledAt-${locationId}`} type="date" name="installedAt" required />
      </div>

      <div className="nn-field">
        <label htmlFor={`trapProvenance-${locationId}`}>{t("provenanceClassLabel")}</label>
        <select id={`trapProvenance-${locationId}`} name="provenanceClass" required defaultValue="">
          <option value="">{t("provenanceClassChoose")}</option>
          {PROCEDENCIA_DE_REGISTRO_DE_CAMPO.map((v) => (
            <option key={v} value={v}>
              {t(`provenanceClass_${v}` as "provenanceClass_original_record")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`trapDataQuality-${locationId}`}>{t("dataQualityLabel")}</label>
        <select id={`trapDataQuality-${locationId}`} name="dataQuality" defaultValue="">
          <option value="">{t("notRecorded")}</option>
          {DATA_QUALITIES.map((v) => (
            <option key={v} value={v}>
              {t(`dataQuality_${v}` as "dataQuality_verified")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`trapNotes-${locationId}`}>{t("notesLabel")}</label>
        <input id={`trapNotes-${locationId}`} type="text" name="notes" placeholder={t("notRecorded")} />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      {state.trapNumber != null ? (
        <p role="status">
          <strong>{t("trapNumberAssigned", { n: state.trapNumber })}</strong>
        </p>
      ) : null}
      <BotonQueNecesitaConexion pending={pending}>{t("trapNewSave")}</BotonQueNecesitaConexion>
    </form>
  );
}
