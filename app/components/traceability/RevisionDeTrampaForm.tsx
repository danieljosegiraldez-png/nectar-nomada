"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recordTrapCheckFormAction, type TraceabilityActionState } from "../../actions/traceability";
import { PROCEDENCIA_DE_REGISTRO_DE_CAMPO } from "../../../lib/traceability/procedencia";
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";
import { TriStateField } from "./TriStateField";

// Misma lista local que `MarcarEnProduccionForm.tsx`.
const DATA_QUALITIES = ["verified", "provisional", "unconfirmed", "not_tested"] as const;
const NIVELES = ["ninguno", "pocos", "algunos", "muchos"] as const;

const initialState: TraceabilityActionState = {};

/**
 * Una visita a una trampa — F2 §4: lectura, otros insectos y mantenimiento en
 * un solo registro.
 *
 * **La escala es obligatoria y no trae valor por defecto**: una lectura
 * preseleccionada se guardaría aunque nadie mirara la tela. El número exacto es
 * opcional y vacío significa «no se contó», nunca 0 (ADR-080).
 *
 * «Otros insectos» es un sí/no/sin registrar y no una casilla: una casilla sin
 * marcar guardaría «no había», que es una afirmación (ver `TriStateField`).
 * El mantenimiento sí es casilla: la columna no admite «sin registrar» y lo no
 * marcado es lo no hecho.
 */
export function RevisionDeTrampaForm({ locationId, specimenId }: { locationId: string; specimenId: string }) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(recordTrapCheckFormAction, initialState);
  const id = (campo: string) => `${campo}-${specimenId}`;

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />
      <input type="hidden" name="specimenId" value={specimenId} />

      <div className="nn-field">
        <label htmlFor={id("observedAt")}>{t("trapCheckDate")}</label>
        <input id={id("observedAt")} type="date" name="observedAt" required />
      </div>

      <div className="nn-field">
        <label htmlFor={id("brocaLevel")}>{t("trapCheckLevel")}</label>
        <select id={id("brocaLevel")} name="brocaLevel" required defaultValue="">
          <option value="">{t("trapCheckLevelChoose")}</option>
          {NIVELES.map((n) => (
            <option key={n} value={n}>
              {t(`trapsLevel_${n}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={id("captureCount")}>{t("trapCheckCount")}</label>
        <input
          id={id("captureCount")}
          type="number"
          name="captureCount"
          min="0"
          step="1"
          inputMode="numeric"
          placeholder={t("notRecorded")}
        />
      </div>

      <TriStateField id={id("otherInsects")} name="otherInsects" label={t("trapCheckOthers")} />
      <div className="nn-field">
        <label htmlFor={id("otherInsectsNote")}>{t("trapCheckOthersNote")}</label>
        <input id={id("otherInsectsNote")} type="text" name="otherInsectsNote" placeholder={t("notRecorded")} />
      </div>

      <div className="nn-field">
        <label>
          <input type="checkbox" name="cleaned" /> {t("trapCheckCleaned")}
        </label>
        <label>
          <input type="checkbox" name="liquidChanged" /> {t("trapCheckLiquid")}
        </label>
        <label>
          <input type="checkbox" name="lureRecharged" /> {t("trapCheckLure")}
        </label>
      </div>

      <div className="nn-field">
        <label htmlFor={id("notes")}>{t("notesLabel")}</label>
        <input id={id("notes")} type="text" name="notes" placeholder={t("notRecorded")} />
      </div>

      <div className="nn-field">
        <label htmlFor={id("provenance")}>{t("provenanceClassLabel")}</label>
        <select id={id("provenance")} name="provenanceClass" required defaultValue="">
          <option value="">{t("provenanceClassChoose")}</option>
          {PROCEDENCIA_DE_REGISTRO_DE_CAMPO.map((v) => (
            <option key={v} value={v}>
              {t(`provenanceClass_${v}` as "provenanceClass_original_record")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={id("dataQuality")}>{t("dataQualityLabel")}</label>
        <select id={id("dataQuality")} name="dataQuality" defaultValue="">
          <option value="">{t("notRecorded")}</option>
          {DATA_QUALITIES.map((v) => (
            <option key={v} value={v}>
              {t(`dataQuality_${v}` as "dataQuality_verified")}
            </option>
          ))}
        </select>
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <BotonQueNecesitaConexion pending={pending}>{t("trapCheckSave")}</BotonQueNecesitaConexion>
    </form>
  );
}
