"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { recordEnteredProductionFormAction, type TraceabilityActionState } from "../../actions/traceability";
import { PROCEDENCIA_DE_SIEMBRA } from "../../../lib/traceability/procedencia";
import { recortarPorPrecision } from "../../../lib/time/recortarPorPrecision";
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";

// Misma lista local que `SampleForms.tsx`: las opciones de calidad del dato.
const DATA_QUALITIES = ["verified", "provisional", "unconfirmed", "not_tested"] as const;
const PRECISIONES = ["year", "month", "date"] as const;

const initialState: TraceabilityActionState = {};

/**
 * Marcar desde cuándo una siembra da cosecha — spec §5 y §6.
 *
 * La fecha sigue el mismo patrón que `plantedAt` en `PlantingCohortForm`:
 * precisión «año» por defecto, porque el paso a producción de una siembra
 * antigua casi nunca se sabe al día, y el tipo de campo sigue a la precisión.
 * Necesita conexión: no se encola.
 */
export function MarcarEnProduccionForm({ cohortId, locationId }: { cohortId: string; locationId: string }) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(recordEnteredProductionFormAction, initialState);
  const [precision, setPrecision] = useState<(typeof PRECISIONES)[number]>("year");
  const [valor, setValor] = useState("");
  const inputType = precision === "date" ? "date" : precision === "month" ? "month" : "number";

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="cohortId" value={cohortId} />
      <input type="hidden" name="locationId" value={locationId} />

      <div className="nn-field">
        <label htmlFor={`occurredPrecision-${cohortId}`}>{t("plantedPrecisionLabel")}</label>
        <select
          id={`occurredPrecision-${cohortId}`}
          name="occurredPrecision"
          value={precision}
          onChange={(e) => {
            const nueva = e.target.value as (typeof PRECISIONES)[number];
            setValor(recortarPorPrecision(valor, nueva));
            setPrecision(nueva);
          }}
        >
          {PRECISIONES.map((p) => (
            <option key={p} value={p}>
              {t(`plantedPrecision_${p}` as "plantedPrecision_year")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`occurredAt-${cohortId}`}>{t("plotDashboardProductionDateLabel")}</label>
        <input
          id={`occurredAt-${cohortId}`}
          name="occurredAt"
          type={inputType}
          required
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
      </div>

      <div className="nn-field">
        <label htmlFor={`productionProvenance-${cohortId}`}>{t("provenanceClassLabel")}</label>
        <select id={`productionProvenance-${cohortId}`} name="provenanceClass" required defaultValue="">
          <option value="">{t("provenanceClassChoose")}</option>
          {PROCEDENCIA_DE_SIEMBRA.map((v) => (
            <option key={v} value={v}>
              {t(`provenanceClass_${v}` as "provenanceClass_original_record")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`productionDataQuality-${cohortId}`}>{t("dataQualityLabel")}</label>
        <select id={`productionDataQuality-${cohortId}`} name="dataQuality" defaultValue="">
          <option value="">{t("notRecorded")}</option>
          {DATA_QUALITIES.map((v) => (
            <option key={v} value={v}>
              {t(`dataQuality_${v}` as "dataQuality_verified")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`productionNotes-${cohortId}`}>{t("notesLabel")}</label>
        <input id={`productionNotes-${cohortId}`} type="text" name="notes" placeholder={t("notRecorded")} />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <BotonQueNecesitaConexion pending={pending}>{t("plotDashboardProductionSaveButton")}</BotonQueNecesitaConexion>
    </form>
  );
}
